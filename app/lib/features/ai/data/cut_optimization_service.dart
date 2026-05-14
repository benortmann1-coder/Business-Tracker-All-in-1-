import '../../cut_list/domain/cut_list_item.dart';

/// Result of a cut-optimization run.
///
/// `sheetCount` is the number of sheets/boards consumed.
/// `wastePercent` is the percentage of material area wasted across all sheets.
/// `layoutSvg` is a per-sheet SVG ready for PDF embedding (filled in Phase 3 v2).
class CutOptimizationResult {
  CutOptimizationResult({
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
    // Placeholder: a real implementation lives in sprint 2 of Phase 1.
    // The shape of the algorithm:
    //   1. Expand items by quantity
    //   2. Sort by largest dimension descending
    //   3. Best-fit decreasing height shelf packing onto sheets
    //   4. Recursively guillotine residual strips
    final totalArea = items.fold<double>(
      0,
      (sum, item) => sum + item.squareInches,
    );
    final sheetArea = sheetLengthInches * sheetWidthInches;
    final sheets = (totalArea / sheetArea).ceil().clamp(1, 999);
    final wastePercent = 100 *
        ((sheets * sheetArea - totalArea) / (sheets * sheetArea))
            .clamp(0.0, 1.0);
    return CutOptimizationResult(
      sheetCount: sheets,
      wastePercent: wastePercent,
    );
  }
}
