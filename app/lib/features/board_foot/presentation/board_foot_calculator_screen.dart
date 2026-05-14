import 'package:flutter/material.dart';

import '../../../core/theme/typography.dart';

class BoardFootCalculatorScreen extends StatefulWidget {
  const BoardFootCalculatorScreen({super.key});

  @override
  State<BoardFootCalculatorScreen> createState() =>
      _BoardFootCalculatorScreenState();
}

class _BoardFootCalculatorScreenState extends State<BoardFootCalculatorScreen> {
  double _thickness = 0;
  double _width = 0;
  double _lengthFeet = 0;
  int _qty = 1;
  double _pricePerBf = 0;

  double get _boardFeet =>
      (_thickness * _width * _lengthFeet * _qty) / 12;

  double get _totalCost => _boardFeet * _pricePerBf;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Board-Foot Calculator')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _input(
            label: 'Thickness (in)',
            onChanged: (v) => setState(() => _thickness = v),
          ),
          const SizedBox(height: 12),
          _input(
            label: 'Width (in)',
            onChanged: (v) => setState(() => _width = v),
          ),
          const SizedBox(height: 12),
          _input(
            label: 'Length (ft)',
            onChanged: (v) => setState(() => _lengthFeet = v),
          ),
          const SizedBox(height: 12),
          _input(
            label: 'Quantity',
            initial: '1',
            isInt: true,
            onChanged: (v) => setState(() => _qty = v.toInt()),
          ),
          const SizedBox(height: 24),
          _input(
            label: r'Price per BF ($)',
            onChanged: (v) => setState(() => _pricePerBf = v),
          ),
          const SizedBox(height: 32),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text('Board Feet', style: t.textTheme.bodyMedium),
                  const SizedBox(height: 8),
                  Text(
                    _boardFeet.toStringAsFixed(2),
                    style: AppTypography.numericDisplay.copyWith(
                      color: t.colorScheme.onSurface,
                    ),
                  ),
                  if (_pricePerBf > 0) ...[
                    const SizedBox(height: 16),
                    Text('Total', style: t.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    Text(
                      '\$${_totalCost.toStringAsFixed(2)}',
                      style: AppTypography.numericDisplay.copyWith(
                        color: t.colorScheme.primary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _input({
    required String label,
    required ValueChanged<double> onChanged,
    String? initial,
    bool isInt = false,
  }) {
    return TextFormField(
      initialValue: initial,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      keyboardType: TextInputType.numberWithOptions(decimal: !isInt),
      onChanged: (s) => onChanged(double.tryParse(s) ?? 0),
    );
  }
}
