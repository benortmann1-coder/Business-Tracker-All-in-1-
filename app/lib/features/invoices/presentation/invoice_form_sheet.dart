import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../clients/data/client_repository.dart';
import '../../clients/domain/client.dart';
import '../../projects/data/project_repository.dart';
import '../../projects/domain/project.dart';
import '../data/invoice_repository.dart';
import '../domain/invoice.dart';
import '../domain/payment_record.dart';
import 'payment_record_form_sheet.dart';

class InvoiceFormSheet extends ConsumerStatefulWidget {
  const InvoiceFormSheet({this.existing, super.key});

  final Invoice? existing;

  static Future<Invoice?> show(BuildContext context, {Invoice? existing}) {
    return Navigator.of(context).push<Invoice>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => InvoiceFormSheet(existing: existing),
      ),
    );
  }

  @override
  ConsumerState<InvoiceFormSheet> createState() => _InvoiceFormSheetState();
}

class _InvoiceFormSheetState extends ConsumerState<InvoiceFormSheet> {
  late final TextEditingController _title;
  late final TextEditingController _subtotal;
  late final TextEditingController _tax;
  late final TextEditingController _total;
  late final TextEditingController _notes;
  late List<PaymentRecord> _payments;
  String? _clientId;
  String? _projectId;
  String? _quoteId;
  late InvoiceStatus _status;
  DateTime? _dueDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _title = TextEditingController(text: e?.title ?? '');
    _subtotal = TextEditingController(
      text: e == null ? '' : (e.subtotalCents / 100).toStringAsFixed(2),
    );
    _tax = TextEditingController(
      text: e == null ? '' : (e.taxCents / 100).toStringAsFixed(2),
    );
    _total = TextEditingController(
      text: e == null ? '' : (e.totalCents / 100).toStringAsFixed(2),
    );
    _notes = TextEditingController(text: e?.notes ?? '');
    _payments = List.of(e?.payments ?? const []);
    _clientId = e?.clientId;
    _projectId = e?.projectId;
    _quoteId = e?.quoteId;
    _status = e?.status ?? InvoiceStatus.draft;
    _dueDate = e?.dueDate;
  }

  @override
  void dispose() {
    _title.dispose();
    _subtotal.dispose();
    _tax.dispose();
    _total.dispose();
    _notes.dispose();
    super.dispose();
  }

  int _readCents(TextEditingController c) =>
      ((double.tryParse(c.text) ?? 0) * 100).round();

  int get _amountPaidCents =>
      _payments.fold(0, (s, p) => s + p.amountCents);

  int get _balanceCents => _readCents(_total) - _amountPaidCents;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isEdit = widget.existing != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(isEdit ? 'Edit invoice' : 'New invoice'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
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
      bottomNavigationBar: _BalanceBar(
        totalCents: _readCents(_total),
        paidCents: _amountPaidCents,
        balanceCents: _balanceCents,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _title,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Invoice title *',
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
          if (_quoteId != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.description_outlined),
              title: const Text('Linked quote'),
              subtitle: Text(_quoteId!.substring(0, 8).toUpperCase()),
            ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.flag_outlined),
            title: const Text('Status'),
            subtitle: Text(_status.label),
            trailing: const Icon(Icons.chevron_right),
            onTap: _pickStatus,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_outlined),
            title: const Text('Due date'),
            subtitle: Text(
              _dueDate == null
                  ? 'None'
                  : '${_dueDate!.month.toString().padLeft(2, '0')}/'
                      '${_dueDate!.day.toString().padLeft(2, '0')}/${_dueDate!.year}',
            ),
            trailing: _dueDate == null
                ? const Icon(Icons.chevron_right)
                : IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Clear',
                    onPressed: () => setState(() => _dueDate = null),
                  ),
            onTap: _pickDueDate,
          ),
          const SizedBox(height: 16),
          Text('Amounts', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _subtotal,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Subtotal',
                    prefixText: r'$ ',
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
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Tax',
                    prefixText: r'$ ',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _total,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.done,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Total *',
              prefixText: r'$ ',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Text('Payments', style: t.textTheme.titleLarge),
              const Spacer(),
              TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Record'),
                onPressed: _addPayment,
              ),
            ],
          ),
          if (_payments.isEmpty)
            Card(
              color: t.colorScheme.surfaceContainerHighest
                  .withValues(alpha: 0.5),
              child: const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'No payments yet. Record deposits, progress payments, '
                  'or the final balance as they come in.',
                ),
              ),
            )
          else
            for (final p in _payments)
              _PaymentRow(
                payment: p,
                onTap: () => _editPayment(p),
                onRemove: () => setState(() => _payments.remove(p)),
              ),
          const SizedBox(height: 24),
          Text('Notes', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Anything the client should see on the invoice…',
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
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Select client',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            const Divider(height: 1),
            if (clients.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No clients yet. Add one from the Clients tab first.',
                ),
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
                  selected: c.id == _clientId,
                  onTap: () => Navigator.of(context).pop(c),
                ),
          ],
        ),
      ),
    );
    if (selected != null) setState(() => _clientId = selected.id);
  }

  Future<void> _pickProject() async {
    final projects = await ref.read(projectRepositoryProvider).list();
    if (!mounted) return;
    final selected = await showModalBottomSheet<Project>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => SafeArea(
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
                child: Text('No projects yet.'),
              )
            else
              for (final p in projects)
                ListTile(
                  title: Text(p.name),
                  selected: p.id == _projectId,
                  onTap: () => Navigator.of(context).pop(p),
                ),
          ],
        ),
      ),
    );
    if (selected != null) setState(() => _projectId = selected.id);
  }

  Future<void> _pickStatus() async {
    final selected = await showModalBottomSheet<InvoiceStatus>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final s in InvoiceStatus.values)
              ListTile(
                title: Text(s.label),
                onTap: () => Navigator.of(context).pop(s),
              ),
          ],
        ),
      ),
    );
    if (selected != null) setState(() => _status = selected);
  }

  Future<void> _pickDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 14)),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _addPayment() async {
    final result = await PaymentRecordFormSheet.show(
      context,
      suggestedAmountCents: _balanceCents > 0 ? _balanceCents : 0,
    );
    if (result != null) setState(() => _payments.add(result));
  }

  Future<void> _editPayment(PaymentRecord p) async {
    final result = await PaymentRecordFormSheet.show(context, existing: p);
    if (result == null) return;
    setState(() {
      final idx = _payments.indexWhere((x) => x.id == p.id);
      if (idx != -1) _payments[idx] = result;
    });
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invoice title is required')),
      );
      return;
    }
    setState(() => _saving = true);
    final existing = widget.existing;
    final invoice = existing == null
        ? Invoice(
            title: title,
            quoteId: _quoteId,
            projectId: _projectId,
            clientId: _clientId,
            status: _status,
            subtotalCents: _readCents(_subtotal),
            taxCents: _readCents(_tax),
            totalCents: _readCents(_total),
            payments: _payments,
            dueDate: _dueDate,
            notes: _notes.text.trim(),
          )
        : existing.copyWith(
            title: title,
            projectId: _projectId,
            setProjectIdToNull: _projectId == null,
            clientId: _clientId,
            setClientIdToNull: _clientId == null,
            status: _status,
            subtotalCents: _readCents(_subtotal),
            taxCents: _readCents(_tax),
            totalCents: _readCents(_total),
            payments: _payments,
            dueDate: _dueDate,
            setDueDateToNull: _dueDate == null,
            notes: _notes.text.trim(),
            updatedAt: DateTime.now(),
          );
    await ref.read(invoiceRepositoryProvider).upsert(invoice);
    ref.invalidate(invoicesListProvider);
    ref.invalidate(invoiceProvider(invoice.id));
    if (!mounted) return;
    Navigator.of(context).pop(invoice);
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

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.payment,
    required this.onTap,
    required this.onRemove,
  });

  final PaymentRecord payment;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: ListTile(
        leading: const Icon(Icons.payments_outlined),
        title: Text('\$${(payment.amountCents / 100).toStringAsFixed(2)}'),
        subtitle: Text(
          '${payment.method.label} • '
          '${payment.paidAt.month.toString().padLeft(2, '0')}/'
          '${payment.paidAt.day.toString().padLeft(2, '0')}/${payment.paidAt.year}'
          '${payment.reference.isEmpty ? '' : ' • ${payment.reference}'}',
          style: t.textTheme.bodySmall,
        ),
        trailing: IconButton(
          icon: const Icon(Icons.delete_outline),
          tooltip: 'Remove',
          onPressed: onRemove,
        ),
        onTap: onTap,
      ),
    );
  }
}

class _BalanceBar extends StatelessWidget {
  const _BalanceBar({
    required this.totalCents,
    required this.paidCents,
    required this.balanceCents,
  });

  final int totalCents;
  final int paidCents;
  final int balanceCents;

  String _f(int c) => '\$${(c / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isPaid = balanceCents <= 0 && totalCents > 0;
    return Material(
      color: t.colorScheme.surfaceContainerHighest,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Total: ${_f(totalCents)}',
                        style: t.textTheme.bodySmall),
                    Text('Paid: ${_f(paidCents)}',
                        style: t.textTheme.bodySmall),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    isPaid ? 'PAID' : 'Balance',
                    style: t.textTheme.bodySmall,
                  ),
                  Text(
                    isPaid ? _f(totalCents) : _f(balanceCents),
                    style: t.textTheme.headlineMedium?.copyWith(
                      color: isPaid
                          ? t.colorScheme.primary
                          : t.colorScheme.error,
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
}
