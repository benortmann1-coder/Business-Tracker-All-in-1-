import 'package:flutter/material.dart';

import '../domain/quote_line_item.dart';

class QuoteLineItemFormSheet extends StatefulWidget {
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
  State<QuoteLineItemFormSheet> createState() => _QuoteLineItemFormSheetState();
}

class _QuoteLineItemFormSheetState extends State<QuoteLineItemFormSheet> {
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
            const SizedBox(height: 16),
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
