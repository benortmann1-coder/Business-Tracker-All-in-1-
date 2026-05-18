import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cut_list/domain/cut_list_item.dart';

/// Result of a cut-optimization run.
///
/// `sheetCount` is the number of sheets/boards consumed.
/// `wastePercent` is the percentage of material area wasted across all sheets.
/// `layoutSvgs` is a per-sheet SVG ready for PDF embedding (filled in Phase 3 v2).
class CutOptimizationResult {
  const CutOptimizationResult({
    required this.sheetCount,
    required this.wastePercent,
    this.layoutSvgs = const [],
  });

  final int sheetCount;
  final double wastePercent;
  final List<String> layoutSvgs;
}

/// Pluggable optimizer. The Phase 1 in-app implementation uses
/// [LocalGuillotineOptimizer]; in Phase 3 we ship a model-assisted variant
/// behind the same interface via a Cloud Function callable.
abstract interface class CutOptimizationService {
  Future<CutOptimizationResult> optimize({
    required List<CutListItem> items,
    required double sheetLengthInches,
    required double sheetWidthInches,
    double kerfInches = 0.125,
  });
}

class LocalGuillotineOptimizer implements CutOptimizationService {
  const LocalGuillotineOptimizer();

  @override
  Future<CutOptimizationResult> optimize({
    required List<CutListItem> items,
    required double sheetLengthInches,
    required double sheetWidthInches,
    double kerfInches = 0.125,
  }) async {
    // Placeholder heuristic — replaced by best-fit decreasing height +
    // recursive guillotine packing in the Phase 1 cut-list sprint.
    final totalArea = items.fold<double>(
      0,
      (sum, item) => sum + item.squareInches,
    );
    final sheetArea = sheetLengthInches * sheetWidthInches;
    if (sheetArea <= 0) {
      return const CutOptimizationResult(sheetCount: 0, wastePercent: 0);
    }
    final sheets = (totalArea / sheetArea).ceil().clamp(1, 999);
    final waste = ((sheets * sheetArea - totalArea) / (sheets * sheetArea))
        .clamp(0.0, 1.0);
    return CutOptimizationResult(
      sheetCount: sheets,
      wastePercent: 100 * waste,
    );
  }
}

/// Default Riverpod binding. Swap to a Cloud Function-backed implementation
/// in Phase 3 via `ProviderScope.overrides`.
final cutOptimizationServiceProvider = Provider<CutOptimizationService>(
  (ref) => const LocalGuillotineOptimizer(),
);
