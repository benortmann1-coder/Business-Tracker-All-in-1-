import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../ai/data/cut_optimization_service.dart';
import '../domain/cut_list_item.dart';

class CutListScreen extends ConsumerStatefulWidget {
  const CutListScreen({required this.projectId, super.key});

  final String projectId;

  @override
  ConsumerState<CutListScreen> createState() => _CutListScreenState();
}

class _CutListScreenState extends ConsumerState<CutListScreen> {
  static const double _defaultSheetLengthIn = 96; // 4×8 sheet
  static const double _defaultSheetWidthIn = 48;

  final List<CutListItem> _items = [];
  CutOptimizationResult? _result;
  bool _optimizing = false;

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
            icon: _optimizing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome_outlined),
            label: Text(_optimizing ? 'Optimizing…' : 'Optimize'),
            onPressed: _items.isEmpty || _optimizing ? null : _optimize,
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
                if (_result != null)
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Card(
                      color: Theme.of(context)
                          .colorScheme
                          .primaryContainer
                          .withValues(alpha: 0.5),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            const Icon(Icons.auto_awesome),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Optimized: ${_result!.sheetCount} sheet${_result!.sheetCount == 1 ? '' : 's'} '
                                '• ${_result!.wastePercent.toStringAsFixed(1)}% waste',
                              ),
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
                          tooltip: 'Remove part',
                          onPressed: () => setState(() {
                            _items.removeAt(i);
                            _result = null;
                          }),
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

  Future<void> _optimize() async {
    setState(() => _optimizing = true);
    final service = ref.read(cutOptimizationServiceProvider);
    final result = await service.optimize(
      items: _items,
      sheetLengthInches: _defaultSheetLengthIn,
      sheetWidthInches: _defaultSheetWidthIn,
    );
    if (!mounted) return;
    setState(() {
      _result = result;
      _optimizing = false;
    });
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
      _result = null;
    });
  }
}
