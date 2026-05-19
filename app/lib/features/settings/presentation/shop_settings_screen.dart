import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/shop_settings_provider.dart';
import '../domain/shop_settings.dart';

class ShopSettingsScreen extends ConsumerStatefulWidget {
  const ShopSettingsScreen({super.key});

  @override
  ConsumerState<ShopSettingsScreen> createState() =>
      _ShopSettingsScreenState();
}

class _ShopSettingsScreenState extends ConsumerState<ShopSettingsScreen> {
  late TextEditingController _name;
  late TextEditingController _address;
  late TextEditingController _phone;
  late TextEditingController _email;
  late TextEditingController _license;
  late TextEditingController _markup;
  late TextEditingController _laborRate;
  late TextEditingController _tax;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    final s = ref.read(shopSettingsProvider);
    _name = TextEditingController(text: s.shopName);
    _address = TextEditingController(text: s.shopAddress ?? '');
    _phone = TextEditingController(text: s.shopPhone ?? '');
    _email = TextEditingController(text: s.shopEmail ?? '');
    _license = TextEditingController(text: s.licenseNumber ?? '');
    _markup = TextEditingController(text: s.defaultMarkupPercent.toString());
    _laborRate = TextEditingController(
      text: (s.defaultLaborRateCents / 100).toStringAsFixed(2),
    );
    _tax = TextEditingController(text: s.defaultTaxPercent.toString());
    _initialized = true;
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _phone.dispose();
    _email.dispose();
    _license.dispose();
    _markup.dispose();
    _laborRate.dispose();
    _tax.dispose();
    super.dispose();
  }

  String? _emptyToNull(String s) {
    final trimmed = s.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shop name is required')),
      );
      return;
    }
    final next = ShopSettings(
      shopName: name,
      shopAddress: _emptyToNull(_address.text),
      shopPhone: _emptyToNull(_phone.text),
      shopEmail: _emptyToNull(_email.text),
      licenseNumber: _emptyToNull(_license.text),
      defaultMarkupPercent:
          double.tryParse(_markup.text) ?? 25,
      defaultLaborRateCents:
          ((double.tryParse(_laborRate.text) ?? 75) * 100).round(),
      defaultTaxPercent: double.tryParse(_tax.text) ?? 0,
    );
    await ref.read(shopSettingsProvider.notifier).update(next);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Shop info saved')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Shop info'),
        actions: [
          TextButton(onPressed: _save, child: const Text('Save')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Letterhead',
            style: t.textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            'Shown at the top of every quote PDF.',
            style: t.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Shop name *',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _address,
            maxLines: 2,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Address',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Phone',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _license,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'License number',
              helperText: 'Required on invoices in some states',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          Text('Defaults for new quotes', style: t.textTheme.titleLarge),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _markup,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
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
                  controller: _laborRate,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Labor rate',
                    prefixText: r'$ ',
                    suffixText: '/ hr',
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _tax,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(
              labelText: 'Default tax %',
              suffixText: '%',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _save, child: const Text('Save shop info')),
        ],
      ),
    );
  }
}
