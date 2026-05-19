import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../../../shared/utils/quote_pdf_renderer.dart';
import '../../../shared/utils/share_helpers.dart';
import '../../clients/data/client_repository.dart';
import '../../clients/domain/client.dart';
import '../../clients/presentation/client_form_sheet.dart';
import '../../projects/data/project_repository.dart';
import '../../projects/domain/project.dart';
import '../../settings/data/shop_settings_provider.dart';
import '../data/quote_repository.dart';
import '../domain/quote.dart';
import '../domain/quote_line_item.dart';
import '../domain/quote_templates.dart';
import 'quote_line_item_form_sheet.dart';
import 'signature_capture_screen.dart';

/// Full-screen quote builder. Push as a modal route via [show].
class QuoteFormSheet extends ConsumerStatefulWidget {
  const QuoteFormSheet({this.existing, super.key});

  final Quote? existing;

  static Future<Quote?> show(BuildContext context, {Quote? existing}) {
    return Navigator.of(context).push<Quote>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => QuoteFormSheet(existing: existing),
      ),
    );
  }

  @override
  ConsumerState<QuoteFormSheet> createState() => _QuoteFormSheetState();
}

class _QuoteFormSheetState extends ConsumerState<QuoteFormSheet> {
  late final TextEditingController _title;
  late final TextEditingController _laborHours;
  late final TextEditingController _laborRate;
  late final TextEditingController _markup;
  late final TextEditingController _tax;
  late final TextEditingController _notes;
  late List<QuoteLineItem> _lineItems;
  String? _clientId;
  String? _projectId;
  QuoteStatus _status = QuoteStatus.draft;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    final defaults = ref.read(shopSettingsProvider);
    _title = TextEditingController(text: e?.title ?? '');
    _laborHours = TextEditingController(text: (e?.laborHours ?? 0).toString());
    _laborRate = TextEditingController(
      text: ((e?.laborRateCents ?? defaults.defaultLaborRateCents) / 100)
          .toStringAsFixed(2),
    );
    _markup = TextEditingController(
      text: (e?.markupPercent ?? defaults.defaultMarkupPercent).toString(),
    );
    _tax = TextEditingController(
      text: (e?.taxPercent ?? defaults.defaultTaxPercent).toString(),
    );
    _notes = TextEditingController(text: e?.notes ?? '');
    _lineItems = List.of(e?.lineItems ?? const []);
    _clientId = e?.clientId;
    _projectId = e?.projectId;
    _status = e?.status ?? QuoteStatus.draft;
  }

  @override
  void dispose() {
    _title.dispose();
    _laborHours.dispose();
    _laborRate.dispose();
    _markup.dispose();
    _tax.dispose();
    _notes.dispose();
    super.dispose();
  }

  double get _laborHoursVal => double.tryParse(_laborHours.text) ?? 0;
  int get _laborRateCents =>
      ((double.tryParse(_laborRate.text) ?? 0) * 100).round();
  double get _markupVal => double.tryParse(_markup.text) ?? 0;
  double get _taxVal => double.tryParse(_tax.text) ?? 0;

  int get _materialTotalCents =>
      _lineItems.fold(0, (sum, li) => sum + li.totalCents);
  int get _laborTotalCents => (_laborHoursVal * _laborRateCents).round();
  int get _subtotalCents => _materialTotalCents + _laborTotalCents;
  int get _afterMarkupCents =>
      (_subtotalCents * (1 + _markupVal / 100)).round();
  int get _totalCents => (_afterMarkupCents * (1 + _taxVal / 100)).round();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isEdit = widget.existing != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(isEdit ? 'Edit quote' : 'New quote'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_outlined),
            tooltip: 'Share quote',
            onPressed: _lineItems.isEmpty && _laborHoursVal == 0
                ? null
                : _share,
          ),
          TextButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save'),
          ),
        ],
      ),
      bottomNavigationBar: _TotalsBar(
        materialTotalCents: _materialTotalCents,
        laborTotalCents: _laborTotalCents,
        markupCents: _afterMarkupCents - _subtotalCents,
        taxCents: _totalCents - _afterMarkupCents,
        totalCents: _totalCents,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (widget.existing == null && _lineItems.isEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: OutlinedButton.icon(
                icon: const Icon(Icons.auto_awesome_outlined),
                label: const Text('Start from a template'),
                onPressed: _pickTemplate,
              ),
            ),
          TextField(
            controller: _title,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Quote title *',
              helperText: 'e.g. Kitchen cabinets, Mudroom built-in',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          _PickerTile(
            icon: Icons.person_outline,
            label: 'Client',
            value: _ClientLookup(clientId: _clientId),
            onTap: _pickClient,
            onClear: _clientId == null
                ? null
                : () => setState(() => _clientId = null),
          ),
          _PickerTile(
            icon: Icons.folder_outlined,
            label: 'Project',
            value: _ProjectLookup(projectId: _projectId),
            onTap: _pickProject,
            onClear: _projectId == null
                ? null
                : () => setState(() => _projectId = null),
          ),
          _StatusTile(
            status: _status,
            onChanged: (s) => setState(() => _status = s),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Text('Line items', style: t.textTheme.titleLarge),
              const Spacer(),
              TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add'),
                onPressed: _addLineItem,
              ),
            ],
          ),
          if (_lineItems.isEmpty)
            Card(
              color: t.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.5),
              child: const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Add materials, hardware, finishes, or services. '
                  'Each line shows up on the printed quote.',
                ),
              ),
            )
          else
            for (final li in _lineItems)
              _LineItemTile(
                item: li,
                onTap: () => _editLineItem(li),
                onRemove: () => setState(() => _lineItems.remove(li)),
              ),
          const SizedBox(height: 24),
          Text('Labor', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _laborHours,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Hours',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _laborRate,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Rate / hr',
                    prefixText: r'$ ',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Markup & tax', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _markup,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Markup %',
                    suffixText: '%',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _tax,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.done,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Tax %',
                    suffixText: '%',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Notes', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          TextField(
            controller: _notes,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'Anything the client should know — lead time, '
                  'warranty, payment terms…',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 96),
        ],
      ),
    );
  }

  Future<void> _pickClient() async {
    final clients = await ref.read(clientRepositoryProvider).list();
    if (!mounted) return;
    final selected = await showModalBottomSheet<Client>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ClientPickerSheet(
        clients: clients,
        selectedId: _clientId,
      ),
    );
    if (selected == null) return;
    if (selected.id == _SentinelClient.newId) {
      final newClient = await ClientFormSheet.show(context);
      if (newClient != null) setState(() => _clientId = newClient.id);
    } else {
      setState(() => _clientId = selected.id);
    }
  }

  Future<void> _pickProject() async {
    final projects = await ref.read(projectRepositoryProvider).list();
    if (!mounted) return;
    final selected = await showModalBottomSheet<Project?>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ProjectPickerSheet(
        projects: projects,
        selectedId: _projectId,
      ),
    );
    if (selected == null) return;
    setState(() => _projectId = selected.id);
  }

  Future<void> _addLineItem() async {
    final item = await QuoteLineItemFormSheet.show(context);
    if (item != null) setState(() => _lineItems.add(item));
  }

  Future<void> _editLineItem(QuoteLineItem li) async {
    final updated = await QuoteLineItemFormSheet.show(context, existing: li);
    if (updated == null) return;
    setState(() {
      final idx = _lineItems.indexWhere((x) => x.id == li.id);
      if (idx != -1) _lineItems[idx] = updated;
    });
  }

  Quote _buildCurrentQuote() {
    final existing = widget.existing;
    if (existing == null) {
      return Quote(
        title: _title.text.trim(),
        clientId: _clientId,
        projectId: _projectId,
        status: _status,
        lineItems: _lineItems,
        laborHours: _laborHoursVal,
        laborRateCents: _laborRateCents,
        markupPercent: _markupVal,
        taxPercent: _taxVal,
        notes: _notes.text.trim(),
      );
    }
    return existing.copyWith(
      title: _title.text.trim(),
      clientId: _clientId,
      setClientIdToNull: _clientId == null,
      projectId: _projectId,
      setProjectIdToNull: _projectId == null,
      status: _status,
      lineItems: _lineItems,
      laborHours: _laborHoursVal,
      laborRateCents: _laborRateCents,
      markupPercent: _markupVal,
      taxPercent: _taxVal,
      notes: _notes.text.trim(),
    );
  }

  Future<void> _pickTemplate() async {
    final selected = await showModalBottomSheet<QuoteTemplate>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Start from template',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                'Pre-built line items and markup — overwrite to match your job.',
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final t in kQuoteTemplates)
                    ListTile(
                      title: Text(t.name),
                      subtitle: Text(t.description),
                      onTap: () => Navigator.of(context).pop(t),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    setState(() {
      if (_title.text.trim().isEmpty) {
        _title.text = selected.name;
      }
      _lineItems = List.of(selected.lineItems);
      _laborHours.text = selected.laborHours.toString();
      _markup.text = selected.markupPercent.toString();
    });
  }

  Future<void> _share() async {
    final quote = _buildCurrentQuote();
    Client? client;
    if (_clientId != null) {
      client = await ref.read(clientRepositoryProvider).get(_clientId!);
    }
    if (!mounted) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Share quote',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.draw_outlined),
              title: const Text('Capture client signature'),
              subtitle: const Text(
                'In-person — hand the device to your client',
              ),
              onTap: () => Navigator.of(sheetCtx).pop('signature'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: const Text('PDF — preview, print, save, or share'),
              subtitle: const Text('Branded quote with signature line'),
              onTap: () => Navigator.of(sheetCtx).pop('pdf'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.mail_outline),
              title: const Text('Email (plain text)'),
              subtitle: client?.email == null
                  ? const Text('Opens your mail composer')
                  : Text('To: ${client?.email}'),
              onTap: () => Navigator.of(sheetCtx).pop('email'),
            ),
            ListTile(
              leading: const Icon(Icons.sms_outlined),
              title: const Text('Text message (plain text)'),
              subtitle: client?.phone == null
                  ? const Text('Opens your messages app')
                  : Text('To: ${client?.phone}'),
              onTap: () => Navigator.of(sheetCtx).pop('sms'),
            ),
            ListTile(
              leading: const Icon(Icons.ios_share_outlined),
              title: const Text('Plain text — system share sheet'),
              onTap: () => Navigator.of(sheetCtx).pop('system'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    final shop = ref.read(shopSettingsProvider);
    switch (action) {
      case 'signature':
        await _captureSignature(quote);
      case 'pdf':
        // Re-fetch in case we just captured a signature mid-flow.
        final freshQuote =
            await ref.read(quoteRepositoryProvider).get(quote.id) ?? quote;
        await Printing.layoutPdf(
          onLayout: (_) => renderQuotePdf(
            quote: freshQuote,
            client: client,
            shopName: shop.shopName,
            shopAddress: shop.shopAddress,
            shopPhone: shop.shopPhone,
            shopEmail: shop.shopEmail,
            shopLicenseNumber: shop.licenseNumber,
          ),
          name: quote.title.isEmpty ? 'Quote' : quote.title,
        );
      case 'email':
        await openMailWithQuote(quote, client: client);
      case 'sms':
        await openSmsWithQuote(quote, client: client);
      case 'system':
        await Share.share(
          formatQuoteText(quote, client: client),
          subject: quote.title.isEmpty ? 'Quote' : quote.title,
        );
    }
  }

  Future<void> _captureSignature(Quote draftQuote) async {
    // Persist any unsaved edits first so the signed quote includes them.
    await ref.read(quoteRepositoryProvider).upsert(draftQuote);
    if (!mounted) return;
    final path = await SignatureCaptureScreen.capture(
      context,
      quoteId: draftQuote.id,
    );
    if (path == null || !mounted) return;
    final signed = draftQuote.copyWith(
      signatureStoragePath: path,
      signedAt: DateTime.now(),
      status: QuoteStatus.approved,
      updatedAt: DateTime.now(),
    );
    await ref.read(quoteRepositoryProvider).upsert(signed);
    ref.invalidate(quotesListProvider);
    ref.invalidate(quoteProvider(signed.id));
    if (!mounted) return;
    setState(() => _status = QuoteStatus.approved);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Signed and approved. Open the PDF to share or print.',
        ),
      ),
    );
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Quote title is required')),
      );
      return;
    }
    setState(() => _saving = true);
    final quote = _buildCurrentQuote();
    await ref.read(quoteRepositoryProvider).upsert(quote);
    ref.invalidate(quotesListProvider);
    ref.invalidate(quoteProvider(quote.id));
    if (!mounted) return;
    Navigator.of(context).pop(quote);
  }
}

class _PickerTile extends StatelessWidget {
  const _PickerTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.onClear,
  });

  final IconData icon;
  final String label;
  final Widget value;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(label),
      subtitle: value,
      trailing: onClear == null
          ? const Icon(Icons.chevron_right)
          : IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Clear',
              onPressed: onClear,
            ),
      onTap: onTap,
    );
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({required this.status, required this.onChanged});

  final QuoteStatus status;
  final ValueChanged<QuoteStatus> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.flag_outlined),
      title: const Text('Status'),
      subtitle: Text(status.label),
      trailing: const Icon(Icons.chevron_right),
      onTap: () async {
        final selected = await showModalBottomSheet<QuoteStatus>(
          context: context,
          builder: (_) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final s in QuoteStatus.values)
                  ListTile(
                    title: Text(s.label),
                    onTap: () => Navigator.of(context).pop(s),
                  ),
              ],
            ),
          ),
        );
        if (selected != null) onChanged(selected);
      },
    );
  }
}

class _ClientLookup extends ConsumerWidget {
  const _ClientLookup({required this.clientId});

  final String? clientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (clientId == null) return const Text('None — tap to select');
    final clientAsync = ref.watch(clientProvider(clientId!));
    return clientAsync.when(
      data: (c) => Text(c?.name ?? 'Unknown client'),
      loading: () => const Text('…'),
      error: (_, __) => const Text('Error loading client'),
    );
  }
}

class _ProjectLookup extends ConsumerWidget {
  const _ProjectLookup({required this.projectId});

  final String? projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (projectId == null) return const Text('None — tap to link');
    final projectAsync = ref.watch(projectProvider(projectId!));
    return projectAsync.when(
      data: (p) => Text(p?.name ?? 'Unknown project'),
      loading: () => const Text('…'),
      error: (_, __) => const Text('Error loading project'),
    );
  }
}

class _LineItemTile extends StatelessWidget {
  const _LineItemTile({
    required this.item,
    required this.onTap,
    required this.onRemove,
  });

  final QuoteLineItem item;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: ListTile(
        title: Text(item.description),
        subtitle: Text(
          '${item.quantity} ${item.unit} × \$${(item.unitCostCents / 100).toStringAsFixed(2)}'
          ' • ${item.category.label}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '\$${(item.totalCents / 100).toStringAsFixed(2)}',
              style: t.textTheme.titleMedium,
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Remove',
              onPressed: onRemove,
            ),
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}

class _TotalsBar extends StatelessWidget {
  const _TotalsBar({
    required this.materialTotalCents,
    required this.laborTotalCents,
    required this.markupCents,
    required this.taxCents,
    required this.totalCents,
  });

  final int materialTotalCents;
  final int laborTotalCents;
  final int markupCents;
  final int taxCents;
  final int totalCents;

  String _f(int c) => '\$${(c / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Material(
      color: t.colorScheme.surfaceContainerHighest,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _row(t, 'Materials', _f(materialTotalCents)),
              _row(t, 'Labor', _f(laborTotalCents)),
              _row(t, 'Markup', _f(markupCents)),
              _row(t, 'Tax', _f(taxCents)),
              const Divider(),
              Row(
                children: [
                  Text('Total', style: t.textTheme.titleLarge),
                  const Spacer(),
                  Text(
                    _f(totalCents),
                    style: t.textTheme.headlineMedium?.copyWith(
                      color: t.colorScheme.primary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(ThemeData t, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Text(label, style: t.textTheme.bodySmall),
            const Spacer(),
            Text(
              value,
              style: t.textTheme.bodySmall?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      );
}

class _SentinelClient {
  static const String newId = '__bevelry_new_client_sentinel__';
}

class _ClientPickerSheet extends StatelessWidget {
  const _ClientPickerSheet({required this.clients, required this.selectedId});

  final List<Client> clients;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ListTile(
            title: Text('Select client', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
          const Divider(height: 1),
          if (clients.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('No clients yet. Add one to get started.'),
            )
          else
            for (final c in clients)
              ListTile(
                leading: CircleAvatar(
                  child: Text(
                    c.name.isEmpty ? '?' : c.name[0].toUpperCase(),
                  ),
                ),
                title: Text(c.name),
                subtitle: c.phone != null || c.email != null
                    ? Text([c.phone, c.email].whereType<String>().join(' • '))
                    : null,
                selected: c.id == selectedId,
                onTap: () => Navigator.of(context).pop(c),
              ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.add),
            title: const Text('New client'),
            onTap: () => Navigator.of(context).pop(
              Client(id: _SentinelClient.newId, name: ''),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProjectPickerSheet extends StatelessWidget {
  const _ProjectPickerSheet({
    required this.projects,
    required this.selectedId,
  });

  final List<Project> projects;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ListTile(
            title: Text(
              'Link to project',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const Divider(height: 1),
          if (projects.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('No projects yet. Skip this — you can link later.'),
            )
          else
            for (final p in projects)
              ListTile(
                title: Text(p.name),
                selected: p.id == selectedId,
                onTap: () => Navigator.of(context).pop(p),
              ),
        ],
      ),
    );
  }
}
