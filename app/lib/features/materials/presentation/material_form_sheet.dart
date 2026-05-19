import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/material_repository.dart';
import '../domain/material_item.dart';

// Reused from quote line item form for consistency.
const List<String> kMaterialUnits = [
  'each',
  'sheet',
  'bf',
  'ft',
  'lf',
  'sqft',
  'hr',
  'lb',
  'oz',
];

class MaterialFormSheet extends ConsumerStatefulWidget {
  const MaterialFormSheet({this.existing, super.key});

  final MaterialItem? existing;

  static Future<MaterialItem?> show(
    BuildContext context, {
    MaterialItem? existing,
  }) {
    return showModalBottomSheet<MaterialItem>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => MaterialFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<MaterialFormSheet> createState() => _MaterialFormSheetState();
}

class _MaterialFormSheetState extends ConsumerState<MaterialFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _vendor;
  late final TextEditingController _sku;
  late final TextEditingController _cost;
  late final TextEditingController _notes;
  late MaterialCategory _category;
  late String _unit;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.name ?? '');
    _vendor = TextEditingController(text: e?.vendor ?? '');
    _sku = TextEditingController(text: e?.sku ?? '');
    _cost = TextEditingController(
      text:
          e == null ? '' : (e.defaultUnitCostCents / 100).toStringAsFixed(2),
    );
    _notes = TextEditingController(text: e?.notes ?? '');
    _category = e?.category ?? MaterialCategory.lumber;
    _unit = e?.defaultUnit ?? 'each';
  }

  @override
  void dispose() {
    _name.dispose();
    _vendor.dispose();
    _sku.dispose();
    _cost.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? _emptyToNull(String s) {
    final t = s.trim();
    return t.isEmpty ? null : t;
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Material name is required')),
      );
      return;
    }
    setState(() => _saving = true);
    final cents = ((double.tryParse(_cost.text) ?? 0) * 100).round();
    final existing = widget.existing;
    final item = existing == null
        ? MaterialItem(
            name: name,
            category: _category,
            defaultUnit: _unit,
            defaultUnitCostCents: cents,
            vendor: _emptyToNull(_vendor.text),
            sku: _emptyToNull(_sku.text),
            notes: _notes.text.trim(),
          )
        : existing.copyWith(
            name: name,
            category: _category,
            defaultUnit: _unit,
            defaultUnitCostCents: cents,
            vendor: _emptyToNull(_vendor.text),
            setVendorToNull: _vendor.text.trim().isEmpty,
            sku: _emptyToNull(_sku.text),
            setSkuToNull: _sku.text.trim().isEmpty,
            notes: _notes.text.trim(),
            updatedAt: DateTime.now(),
          );
    await ref.read(materialRepositoryProvider).upsert(item);
    ref.invalidate(materialsListProvider);
    ref.invalidate(materialProvider(item.id));
    if (!mounted) return;
    Navigator.of(context).pop(item);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isEdit = widget.existing != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: t.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              isEdit ? 'Edit material' : 'New material',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Name *',
                helperText: 'e.g. 4/4 walnut FAS, Blum 110° soft-close',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final c in MaterialCategory.values)
                  ChoiceChip(
                    label: Text(c.label),
                    selected: _category == c,
                    onSelected: (sel) {
                      if (sel) setState(() => _category = c);
                    },
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _cost,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Default cost',
                      prefixText: r'$ ',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 120,
                  child: DropdownButtonFormField<String>(
                    value: _unit,
                    decoration: const InputDecoration(
                      labelText: 'Unit',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final u in kMaterialUnits)
                        DropdownMenuItem(value: u, child: Text(u)),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _unit = v);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _vendor,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Vendor',
                helperText: 'Where you buy it',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _sku,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'SKU / part number',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(isEdit ? 'Save changes' : 'Add to library'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
