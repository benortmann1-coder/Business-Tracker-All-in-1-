import 'package:flutter/material.dart';

import '../domain/cut_list_item.dart';

class CutListScreen extends StatefulWidget {
  const CutListScreen({required this.projectId, super.key});

  final String projectId;

  @override
  State<CutListScreen> createState() => _CutListScreenState();
}

class _CutListScreenState extends State<CutListScreen> {
  final List<CutListItem> _items = [];

  @override
  Widget build(BuildContext context) {
    final totalSqIn =
        _items.fold<double>(0, (sum, item) => sum + item.squareInches);

    return Scaffold(
      appBar: AppBar(title: const Text('Cut List')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Add Part'),
        onPressed: _addItem,
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            icon: const Icon(Icons.auto_awesome_outlined),
            label: const Text('Optimize'),
            onPressed: _items.isEmpty ? null : () {},
          ),
        ),
      ),
      body: _items.isEmpty
          ? const Center(
              child: Text('No parts yet. Tap "Add Part" to begin.'),
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Parts',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          Text(
                            '${_items.length} • ${totalSqIn.toStringAsFixed(1)} sq in',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final item = _items[i];
                      return ListTile(
                        title: Text(item.partName),
                        subtitle: Text(
                          '${item.lengthInches}" × ${item.widthInches}" × ${item.quantity}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () => setState(() => _items.removeAt(i)),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 80),
              ],
            ),
    );
  }

  void _addItem() {
    setState(() {
      _items.add(
        CutListItem(
          partName: 'Part ${_items.length + 1}',
          materialId: 'placeholder',
          lengthInches: 24,
          widthInches: 12,
        ),
      );
    });
  }
}
