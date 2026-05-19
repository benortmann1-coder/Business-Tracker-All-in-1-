import 'package:flutter/material.dart';

import '../domain/cut_list_item.dart';

class CutListPartFormResult {
  CutListPartFormResult({
    required this.partName,
    required this.lengthInches,
    required this.widthInches,
    required this.quantity,
    required this.grainDirection,
  });

  final String partName;
  final double lengthInches;
  final double widthInches;
  final int quantity;
  final GrainDirection grainDirection;
}

class CutListPartFormSheet extends StatefulWidget {
  const CutListPartFormSheet({this.existing, super.key});

  final CutListItem? existing;

  static Future<CutListPartFormResult?> show(
    BuildContext context, {
    CutListItem? existing,
  }) {
    return showModalBottomSheet<CutListPartFormResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CutListPartFormSheet(existing: existing),
    );
  }

  @override
  State<CutListPartFormSheet> createState() => _CutListPartFormSheetState();
}

class _CutListPartFormSheetState extends State<CutListPartFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _length;
  late final TextEditingController _width;
  late final TextEditingController _quantity;
  late GrainDirection _grain;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _name = TextEditingController(text: e?.partName ?? '');
    _length = TextEditingController(text: e?.lengthInches.toString() ?? '');
    _width = TextEditingController(text: e?.widthInches.toString() ?? '');
    _quantity = TextEditingController(text: (e?.quantity ?? 1).toString());
    _grain = e?.grainDirection ?? GrainDirection.length;
  }

  @override
  void dispose() {
    _name.dispose();
    _length.dispose();
    _width.dispose();
    _quantity.dispose();
    super.dispose();
  }

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
              widget.existing == null ? 'Add part' : 'Edit part',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Part name *',
                helperText: 'e.g. Top shelf, Left side panel',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _length,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Length (in) *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _width,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Width (in) *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 96,
                  child: TextField(
                    controller: _quantity,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Qty *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('Grain direction', style: t.textTheme.titleSmall),
            const SizedBox(height: 8),
            SegmentedButton<GrainDirection>(
              segments: const [
                ButtonSegment(
                  value: GrainDirection.length,
                  label: Text('Length'),
                ),
                ButtonSegment(
                  value: GrainDirection.width,
                  label: Text('Width'),
                ),
                ButtonSegment(
                  value: GrainDirection.none,
                  label: Text('None'),
                ),
              ],
              selected: {_grain},
              onSelectionChanged: (s) => setState(() => _grain = s.first),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _save,
              child: Text(widget.existing == null ? 'Add part' : 'Save'),
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
    final name = _name.text.trim();
    final length = double.tryParse(_length.text);
    final width = double.tryParse(_width.text);
    final quantity = int.tryParse(_quantity.text);

    if (name.isEmpty) {
      _showError('Part name is required');
      return;
    }
    if (length == null || length <= 0) {
      _showError('Length must be greater than 0');
      return;
    }
    if (width == null || width <= 0) {
      _showError('Width must be greater than 0');
      return;
    }
    if (quantity == null || quantity < 1) {
      _showError('Quantity must be at least 1');
      return;
    }
    Navigator.of(context).pop(
      CutListPartFormResult(
        partName: name,
        lengthInches: length,
        widthInches: width,
        quantity: quantity,
        grainDirection: _grain,
      ),
    );
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}
