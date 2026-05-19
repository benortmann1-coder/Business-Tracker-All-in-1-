import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../shared/utils/fractional_inches.dart';
import '../../ai/data/cut_optimization_service.dart';
import '../domain/cut_list_item.dart';
import 'cut_list_part_form_sheet.dart';

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
                if (_result != null) _OptimizationResultPanel(result: _result!),
                Expanded(
                  child: ListView.separated(
                    itemCount: _items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final item = _items[i];
                      return ListTile(
                        title: Text(item.partName),
                        subtitle: Text(
                          '${formatInchesFractional(item.lengthInches)} × '
                          '${formatInchesFractional(item.widthInches)} × '
                          '${item.quantity}'
                          '${item.grainDirection == GrainDirection.none ? '' : ' • grain: ${item.grainDirection.name}'}',
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline),
                          tooltip: 'Remove part',
                          iconSize: 24,
                          padding: const EdgeInsets.all(12),
                          onPressed: () => setState(() {
                            _items.removeAt(i);
                            _result = null;
                          }),
                        ),
                        onTap: () => _editItem(i),
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

  Future<void> _addItem() async {
    final result = await CutListPartFormSheet.show(context);
    if (result == null) return;
    setState(() {
      _items.add(
        CutListItem(
          partName: result.partName,
          materialId: 'placeholder',
          lengthInches: result.lengthInches,
          widthInches: result.widthInches,
          quantity: result.quantity,
          grainDirection: result.grainDirection,
        ),
      );
      _result = null;
    });
  }

  Future<void> _editItem(int index) async {
    final existing = _items[index];
    final result =
        await CutListPartFormSheet.show(context, existing: existing);
    if (result == null) return;
    setState(() {
      _items[index] = CutListItem(
        id: existing.id,
        partName: result.partName,
        materialId: existing.materialId,
        lengthInches: result.lengthInches,
        widthInches: result.widthInches,
        quantity: result.quantity,
        grainDirection: result.grainDirection,
      );
      _result = null;
    });
  }
}

class _OptimizationResultPanel extends StatefulWidget {
  const _OptimizationResultPanel({required this.result});

  final CutOptimizationResult result;

  @override
  State<_OptimizationResultPanel> createState() =>
      _OptimizationResultPanelState();
}

class _OptimizationResultPanelState extends State<_OptimizationResultPanel> {
  final PageController _controller = PageController(viewportFraction: 0.92);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final sheets = widget.result.sheets;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: t.colorScheme.primaryContainer.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Optimized: ${widget.result.sheetCount} '
                    'sheet${widget.result.sheetCount == 1 ? '' : 's'} • '
                    '${widget.result.wastePercent.toStringAsFixed(1)}% waste',
                    style: t.textTheme.bodyLarge,
                  ),
                ),
              ],
            ),
            if (sheets.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                height: 180,
                child: PageView.builder(
                  controller: _controller,
                  itemCount: sheets.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) => _SheetCard(
                    layout: sheets[i],
                    index: i + 1,
                    total: sheets.length,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              if (sheets.length > 1)
                Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < sheets.length; i++)
                        Container(
                          width: 6,
                          height: 6,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i == _page
                                ? t.colorScheme.primary
                                : t.colorScheme.onSurface.withValues(alpha: 0.2),
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SheetCard extends StatelessWidget {
  const _SheetCard({
    required this.layout,
    required this.index,
    required this.total,
  });

  final SheetLayout layout;
  final int index;
  final int total;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Card(
        elevation: 0,
        color: t.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: t.dividerColor),
        ),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Sheet $index / $total — '
                '${layout.sheetLengthInches.toStringAsFixed(0)}" × '
                '${layout.sheetWidthInches.toStringAsFixed(0)}" '
                '• ${layout.wastePercent.toStringAsFixed(1)}% waste',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              Expanded(
                child: SvgPicture.string(
                  layout.toSvg(),
                  fit: BoxFit.contain,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
