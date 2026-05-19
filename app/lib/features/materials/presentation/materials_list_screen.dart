import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/empty_state.dart';
import '../data/material_repository.dart';
import '../domain/material_item.dart';
import 'material_form_sheet.dart';

class MaterialsListScreen extends ConsumerStatefulWidget {
  const MaterialsListScreen({super.key});

  @override
  ConsumerState<MaterialsListScreen> createState() =>
      _MaterialsListScreenState();
}

class _MaterialsListScreenState extends ConsumerState<MaterialsListScreen> {
  MaterialCategory? _filter;
  final TextEditingController _search = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final materialsAsync = ref.watch(materialsListProvider);
    final query = _search.text.trim().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _search,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search materials, vendors, SKU…',
                  border: InputBorder.none,
                ),
                onChanged: (_) => setState(() {}),
              )
            : const Text('Materials library'),
        actions: [
          IconButton(
            tooltip: _searching ? 'Close search' : 'Search',
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) _search.clear();
            }),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New material'),
        onPressed: () => MaterialFormSheet.show(context),
      ),
      body: materialsAsync.when(
        data: (materials) {
          if (materials.isEmpty) {
            return EmptyState(
              icon: Icons.layers_outlined,
              title: 'Build your materials library',
              subtitle:
                  'Save lumber, hardware, finishes, and adhesives once. Use '
                  'them as line items on every quote.',
              actionLabel: '+ New material',
              onAction: () => MaterialFormSheet.show(context),
            );
          }
          final filtered = materials.where((m) {
            if (_filter != null && m.category != _filter) return false;
            if (query.isEmpty) return true;
            if (m.name.toLowerCase().contains(query)) return true;
            if (m.vendor?.toLowerCase().contains(query) ?? false) return true;
            if (m.sku?.toLowerCase().contains(query) ?? false) return true;
            return false;
          }).toList();
          return Column(
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    FilterChip(
                      label: const Text('All'),
                      selected: _filter == null,
                      onSelected: (_) => setState(() => _filter = null),
                    ),
                    const SizedBox(width: 6),
                    for (final c in MaterialCategory.values) ...[
                      FilterChip(
                        label: Text(c.label),
                        selected: _filter == c,
                        onSelected: (_) => setState(() => _filter = c),
                      ),
                      const SizedBox(width: 6),
                    ],
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: filtered.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text(
                            'No materials match your filter.',
                            style: Theme.of(context).textTheme.bodyMedium,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : ListView.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) => _MaterialRow(item: filtered[i]),
                      ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _MaterialRow extends StatelessWidget {
  const _MaterialRow({required this.item});

  final MaterialItem item;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final subtitle = <String>[
      item.category.label,
      if (item.vendor != null) item.vendor!,
      if (item.sku != null) 'SKU ${item.sku}',
    ].join(' • ');
    return ListTile(
      minVerticalPadding: 14,
      title: Text(item.name, style: t.textTheme.titleLarge),
      subtitle: Text(subtitle),
      trailing: Text(
        item.defaultUnitCostCents == 0
            ? '—'
            : '\$${(item.defaultUnitCostCents / 100).toStringAsFixed(2)} / ${item.defaultUnit}',
        style: t.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      onTap: () => MaterialFormSheet.show(context, existing: item),
    );
  }
}
