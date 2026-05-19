import 'package:flutter/material.dart';

import '../domain/payment_record.dart';

class PaymentRecordFormSheet extends StatefulWidget {
  const PaymentRecordFormSheet({
    this.existing,
    this.suggestedAmountCents = 0,
    super.key,
  });

  final PaymentRecord? existing;
  final int suggestedAmountCents;

  static Future<PaymentRecord?> show(
    BuildContext context, {
    PaymentRecord? existing,
    int suggestedAmountCents = 0,
  }) {
    return showModalBottomSheet<PaymentRecord>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => PaymentRecordFormSheet(
        existing: existing,
        suggestedAmountCents: suggestedAmountCents,
      ),
    );
  }

  @override
  State<PaymentRecordFormSheet> createState() => _PaymentRecordFormSheetState();
}

class _PaymentRecordFormSheetState extends State<PaymentRecordFormSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _reference;
  late PaymentMethod _method;
  late DateTime _paidAt;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    final initialCents = e?.amountCents ?? widget.suggestedAmountCents;
    _amount = TextEditingController(
      text: initialCents == 0
          ? ''
          : (initialCents / 100).toStringAsFixed(2),
    );
    _reference = TextEditingController(text: e?.reference ?? '');
    _method = e?.method ?? PaymentMethod.cash;
    _paidAt = e?.paidAt ?? DateTime.now();
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  void _save() {
    final amount = double.tryParse(_amount.text) ?? 0;
    if (amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Amount must be greater than 0')),
      );
      return;
    }
    final cents = (amount * 100).round();
    final existing = widget.existing;
    final record = existing == null
        ? PaymentRecord(
            amountCents: cents,
            method: _method,
            reference: _reference.text.trim(),
            paidAt: _paidAt,
          )
        : existing.copyWith(
            amountCents: cents,
            method: _method,
            reference: _reference.text.trim(),
            paidAt: _paidAt,
          );
    Navigator.of(context).pop(record);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _paidAt,
      firstDate: DateTime.now().subtract(const Duration(days: 365 * 5)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _paidAt = picked);
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
              widget.existing == null
                  ? 'Record a payment'
                  : 'Edit payment',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _amount,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Amount *',
                prefixText: r'$ ',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<PaymentMethod>(
              value: _method,
              decoration: const InputDecoration(
                labelText: 'Method',
                border: OutlineInputBorder(),
              ),
              items: [
                for (final m in PaymentMethod.values)
                  DropdownMenuItem(value: m, child: Text(m.label)),
              ],
              onChanged: (m) {
                if (m != null) setState(() => _method = m);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reference,
              decoration: const InputDecoration(
                labelText: 'Reference',
                helperText: 'Check #, last 4 of card, Venmo handle…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: const Text('Paid on'),
              subtitle: Text(
                '${_paidAt.month.toString().padLeft(2, '0')}/'
                '${_paidAt.day.toString().padLeft(2, '0')}/${_paidAt.year}',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: _pickDate,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _save,
              child:
                  Text(widget.existing == null ? 'Add payment' : 'Save'),
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
