import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../materials/data/material_repository.dart';
import '../../materials/domain/material_item.dart';
import '../domain/quote_line_item.dart';

class QuoteLineItemFormSheet extends ConsumerStatefulWidget {
  const QuoteLineItemFormSheet({this.existing, super.key});

  final QuoteLineItem? existing;

  static Future<QuoteLineItem?> show(
    BuildContext context, {
    QuoteLineItem? existing,
  }) {
    return showModalBottomSheet<QuoteLineItem>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => QuoteLineItemFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<QuoteLineItemFormSheet> createState() =>
      _QuoteLineItemFormSheetState();
}

class _QuoteLineItemFormSheetState
    extends ConsumerState<QuoteLineItemFormSheet> {
  late final TextEditingController _description;
  late final TextEditingController _quantity;
  late final TextEditingController _unitCost;
  late String _unit;
  late QuoteLineCategory _category;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _description = TextEditingController(text: e?.description ?? '');
    _quantity = TextEditingController(text: (e?.quantity ?? 1).toString());
    _unitCost = TextEditingController(
      text: e == null ? '' : (e.unitCostCents / 100).toStringAsFixed(2),
    );
    _unit = e?.unit ?? 'each';
    _category = e?.category ?? QuoteLineCategory.material;
  }

  @override
  void dispose() {
    _description.dispose();
    _quantity.dispose();
    _unitCost.dispose();
    super.dispose();
  }

  double get _qty => double.tryParse(_quantity.text) ?? 0;
  int get _unitCostCents => ((double.tryParse(_unitCost.text) ?? 0) * 100).round();
  int get _totalCents => (_qty * _unitCostCents).round();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
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
              widget.existing == null ? 'Add line item' : 'Edit line item',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            if (widget.existing == null)
              OutlinedButton.icon(
                icon: const Icon(Icons.layers_outlined),
                label: const Text('Pick from materials library'),
                onPressed: _pickFromLibrary,
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Description *',
                helperText: 'e.g. 4/4 white oak, Blum 110° hinges',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final c in QuoteLineCategory.values)
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
                    controller: _quantity,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textInputAction: TextInputAction.next,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Quantity *',
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
                      for (final u in kQuoteLineUnits)
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
              controller: _unitCost,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Unit cost *',
                prefixText: r'$ ',
                helperText: 'Per unit, before markup',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              color: t.colorScheme.primaryContainer.withValues(alpha: 0.5),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Text('Line total'),
                    const Spacer(),
                    Text(
                      _formatCents(_totalCents),
                      style: t.textTheme.titleLarge,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _save,
              child: Text(widget.existing == null ? 'Add' : 'Save'),
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

  Future<void> _pickFromLibrary() async {
    final materials = await ref.read(materialRepositoryProvider).list();
    if (!mounted) return;
    if (materials.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Your materials library is empty. Add materials in Settings.',
          ),
        ),
      );
      return;
    }
    final selected = await showModalBottomSheet<MaterialItem>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Pick a material',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: materials.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final m = materials[i];
                  return ListTile(
                    title: Text(m.name),
                    subtitle: Text(
                      '${m.category.label}'
                      '${m.vendor == null ? '' : ' • ${m.vendor}'}',
                    ),
                    trailing: Text(
                      m.defaultUnitCostCents == 0
                          ? ''
                          : '\$${(m.defaultUnitCostCents / 100).toStringAsFixed(2)} / ${m.defaultUnit}',
                    ),
                    onTap: () => Navigator.of(context).pop(m),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    setState(() {
      _description.text = selected.name;
      _unit = selected.defaultUnit;
      _category = _categoryFromMaterial(selected.category);
      if (selected.defaultUnitCostCents > 0) {
        _unitCost.text =
            (selected.defaultUnitCostCents / 100).toStringAsFixed(2);
      }
    });
  }

  QuoteLineCategory _categoryFromMaterial(MaterialCategory c) {
    switch (c) {
      case MaterialCategory.lumber:
      case MaterialCategory.sheetGoods:
        return QuoteLineCategory.material;
      case MaterialCategory.hardware:
      case MaterialCategory.fasteners:
        return QuoteLineCategory.hardware;
      case MaterialCategory.finishes:
      case MaterialCategory.adhesives:
        return QuoteLineCategory.finish;
      case MaterialCategory.other:
        return QuoteLineCategory.other;
    }
  }

  void _save() {
    final description = _description.text.trim();
    if (description.isEmpty) {
      _showError('Description is required');
      return;
    }
    if (_qty <= 0) {
      _showError('Quantity must be greater than 0');
      return;
    }
    if (_unitCostCents < 0) {
      _showError('Unit cost cannot be negative');
      return;
    }
    final existing = widget.existing;
    final item = existing == null
        ? QuoteLineItem(
            description: description,
            quantity: _qty,
            unit: _unit,
            unitCostCents: _unitCostCents,
            category: _category,
          )
        : existing.copyWith(
            description: description,
            quantity: _qty,
            unit: _unit,
            unitCostCents: _unitCostCents,
            category: _category,
          );
    Navigator.of(context).pop(item);
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  String _formatCents(int cents) {
    final dollars = cents / 100;
    return '\$${dollars.toStringAsFixed(2)}';
  }
}
