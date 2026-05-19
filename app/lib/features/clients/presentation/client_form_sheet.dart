import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/client_repository.dart';
import '../domain/client.dart';

/// Modal bottom sheet for creating or editing a [Client].
class ClientFormSheet extends ConsumerStatefulWidget {
  const ClientFormSheet({this.existing, super.key});

  final Client? existing;

  static Future<Client?> show(BuildContext context, {Client? existing}) {
    return showModalBottomSheet<Client>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ClientFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<ClientFormSheet> createState() => _ClientFormSheetState();
}

class _ClientFormSheetState extends ConsumerState<ClientFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _email;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  late final TextEditingController _notes;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final c = widget.existing;
    _name = TextEditingController(text: c?.name ?? '');
    _email = TextEditingController(text: c?.email ?? '');
    _phone = TextEditingController(text: c?.phone ?? '');
    _address = TextEditingController(text: c?.address ?? '');
    _notes = TextEditingController(text: c?.notes ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
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
              isEdit ? 'Edit client' : 'New client',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Client name *',
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
              controller: _address,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Address',
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
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(isEdit ? 'Save changes' : 'Add client'),
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

  String? _emptyToNull(String s) {
    final trimmed = s.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Client name is required')),
      );
      return;
    }
    setState(() => _saving = true);
    final repo = ref.read(clientRepositoryProvider);
    final existing = widget.existing;
    final client = existing == null
        ? Client(
            name: name,
            email: _emptyToNull(_email.text),
            phone: _emptyToNull(_phone.text),
            address: _emptyToNull(_address.text),
            notes: _notes.text.trim(),
          )
        : existing.copyWith(
            name: name,
            email: _emptyToNull(_email.text),
            setEmailToNull: _email.text.trim().isEmpty,
            phone: _emptyToNull(_phone.text),
            setPhoneToNull: _phone.text.trim().isEmpty,
            address: _emptyToNull(_address.text),
            setAddressToNull: _address.text.trim().isEmpty,
            notes: _notes.text.trim(),
            updatedAt: DateTime.now(),
          );
    await repo.upsert(client);
    ref.invalidate(clientsListProvider);
    ref.invalidate(clientProvider(client.id));
    if (!mounted) return;
    Navigator.of(context).pop(client);
  }
}
