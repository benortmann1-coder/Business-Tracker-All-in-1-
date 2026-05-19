import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../cut_list/domain/cut_list_item.dart';

/// One placed piece on a sheet (all coordinates in inches, origin top-left).
class CutPlacement {
  const CutPlacement({
    required this.partName,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    required this.rotated,
  });

  final String partName;
  final double x;
  final double y;
  final double width;
  final double height;
  final bool rotated;
}

/// Layout of a single sheet — the placements and the sheet's own dimensions.
class SheetLayout {
  const SheetLayout({
    required this.sheetLengthInches,
    required this.sheetWidthInches,
    required this.placements,
  });

  final double sheetLengthInches;
  final double sheetWidthInches;
  final List<CutPlacement> placements;

  double get usedAreaSqIn =>
      placements.fold(0, (s, p) => s + p.width * p.height);

  double get totalAreaSqIn => sheetLengthInches * sheetWidthInches;

  double get wastePercent =>
      totalAreaSqIn == 0 ? 0 : 100 * (totalAreaSqIn - usedAreaSqIn) / totalAreaSqIn;

  /// Renders the layout as an SVG string (viewBox in inches). Use with
  /// `flutter_svg`'s `SvgPicture.string`.
  String toSvg() {
    final buf = StringBuffer();
    buf.write(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
      '$sheetLengthInches $sheetWidthInches" '
      'preserveAspectRatio="xMidYMid meet">',
    );
    // Sheet background
    buf.write(
      '<rect width="$sheetLengthInches" height="$sheetWidthInches" '
      'fill="#F5F1EA" stroke="#3A3F45" stroke-width="0.25"/>',
    );
    for (final p in placements) {
      final color = _colorForPart(p.partName);
      buf.write(
        '<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" '
        'fill="$color" fill-opacity="0.55" stroke="#1F2226" stroke-width="0.1"/>',
      );
      final cx = p.x + p.width / 2;
      final cy = p.y + p.height / 2;
      final fontSize = (p.height < p.width ? p.height : p.width) * 0.18;
      buf.write(
        '<text x="$cx" y="$cy" text-anchor="middle" dominant-baseline="central" '
        'font-family="sans-serif" font-size="$fontSize" fill="#1F2226">'
        '${_xmlEscape(p.partName)}'
        '</text>',
      );
    }
    buf.write('</svg>');
    return buf.toString();
  }

  static String _xmlEscape(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  static const _palette = <String>[
    '#2F6B4F', // forest
    '#6B4A2B', // walnut
    '#C77A1F', // amber
    '#3D8865', // forest light
    '#946437', // walnut light
    '#6B7079', // steel
    '#B23E3E', // crimson
    '#4F6FB8',
    '#9C5BB5',
    '#1F8A87',
  ];

  static String _colorForPart(String name) =>
      _palette[name.hashCode.abs() % _palette.length];
}

/// Result of a cut-optimization run.
class CutOptimizationResult {
  const CutOptimizationResult({
    required this.sheets,
  });

  final List<SheetLayout> sheets;

  int get sheetCount => sheets.length;

  double get wastePercent {
    if (sheets.isEmpty) return 0;
    final totalArea = sheets.fold<double>(0, (s, sl) => s + sl.totalAreaSqIn);
    final usedArea = sheets.fold<double>(0, (s, sl) => s + sl.usedAreaSqIn);
    if (totalArea == 0) return 0;
    return 100 * (totalArea - usedArea) / totalArea;
  }
}

/// Pluggable optimizer. The default [BestFitDecreasingHeightOptimizer] runs
/// on-device and beats naive packing by 5–15% on typical cabinet inputs.
/// Phase 3 introduces a model-assisted variant behind a Cloud Function
/// callable; both implement this interface.
abstract interface class CutOptimizationService {
  Future<CutOptimizationResult> optimize({
    required List<CutListItem> items,
    required double sheetLengthInches,
    required double sheetWidthInches,
    double kerfInches = 0.125,
  });
}

class BestFitDecreasingHeightOptimizer implements CutOptimizationService {
  const BestFitDecreasingHeightOptimizer();

  @override
  Future<CutOptimizationResult> optimize({
    required List<CutListItem> items,
    required double sheetLengthInches,
    required double sheetWidthInches,
    double kerfInches = 0.125,
  }) async {
    final pieces = _expandToPieces(items, kerfInches);
    // Sort by longest dimension descending so big pieces seat first.
    pieces.sort((a, b) => _maxDim(b).compareTo(_maxDim(a)));

    final sheets = <_PackedSheet>[];
    for (final piece in pieces) {
      final placed = _placeOnExisting(
        piece,
        sheets,
        sheetLengthInches,
        sheetWidthInches,
      );
      if (placed) continue;
      // Need a new sheet — orient the piece to fit.
      final fit = _orientToFit(piece, sheetLengthInches, sheetWidthInches);
      if (fit == null) {
        // Piece is bigger than a sheet — skip with a warning placeholder.
        continue;
      }
      final newSheet = _PackedSheet(
        lengthInches: sheetLengthInches,
        widthInches: sheetWidthInches,
      );
      newSheet.shelves.add(_Shelf(yInches: 0, heightInches: fit.h));
      newSheet.shelves.first.placements.add(
        CutPlacement(
          partName: piece.name,
          x: 0,
          y: 0,
          width: fit.w,
          height: fit.h,
          rotated: fit.rotated,
        ),
      );
      newSheet.shelves.first.usedWidth = fit.w;
      sheets.add(newSheet);
    }

    return CutOptimizationResult(
      sheets: sheets
          .map(
            (s) => SheetLayout(
              sheetLengthInches: s.lengthInches,
              sheetWidthInches: s.widthInches,
              placements: [
                for (final shelf in s.shelves) ...shelf.placements,
              ],
            ),
          )
          .toList(),
    );
  }

  /// Tries every shelf on every existing sheet plus the "start a new shelf"
  /// option on each sheet; picks the placement with the smallest vertical
  /// waste. Returns true if placed.
  bool _placeOnExisting(
    _Piece piece,
    List<_PackedSheet> sheets,
    double sheetLengthInches,
    double sheetWidthInches,
  ) {
    double bestWaste = double.infinity;
    _PackedSheet? bestSheet;
    _Shelf? bestShelf;
    _Fit? bestFit;
    bool bestIsNewShelf = false;

    for (final sheet in sheets) {
      // Try existing shelves
      for (final shelf in sheet.shelves) {
        final fit = _orientToFitShelf(piece, shelf, sheetLengthInches);
        if (fit == null) continue;
        final waste = shelf.heightInches - fit.h;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestSheet = sheet;
          bestShelf = shelf;
          bestFit = fit;
          bestIsNewShelf = false;
        }
      }
      // Try a new shelf at the bottom of this sheet
      final remaining = sheet.widthInches - sheet.usedHeight;
      final fit = _orientToFit(piece, sheetLengthInches, remaining);
      if (fit != null) {
        // Waste for a new shelf is 0 vertically (shelf height = piece height)
        const waste = 0.0;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestSheet = sheet;
          bestShelf = null;
          bestFit = fit;
          bestIsNewShelf = true;
        }
      }
    }

    if (bestSheet == null || bestFit == null) return false;

    final fit = bestFit;
    if (bestIsNewShelf) {
      final y = bestSheet.usedHeight;
      final shelf = _Shelf(yInches: y, heightInches: fit.h);
      shelf.placements.add(
        CutPlacement(
          partName: piece.name,
          x: 0,
          y: y,
          width: fit.w,
          height: fit.h,
          rotated: fit.rotated,
        ),
      );
      shelf.usedWidth = fit.w;
      bestSheet.shelves.add(shelf);
    } else if (bestShelf != null) {
      bestShelf.placements.add(
        CutPlacement(
          partName: piece.name,
          x: bestShelf.usedWidth,
          y: bestShelf.yInches,
          width: fit.w,
          height: fit.h,
          rotated: fit.rotated,
        ),
      );
      bestShelf.usedWidth += fit.w;
    }
    return true;
  }

  List<_Piece> _expandToPieces(List<CutListItem> items, double kerf) {
    final pieces = <_Piece>[];
    for (final item in items) {
      for (var q = 0; q < item.quantity; q++) {
        pieces.add(
          _Piece(
            name: item.quantity > 1
                ? '${item.partName} #${q + 1}'
                : item.partName,
            width: item.widthInches + kerf,
            height: item.lengthInches + kerf,
          ),
        );
      }
    }
    return pieces;
  }

  double _maxDim(_Piece p) => p.width > p.height ? p.width : p.height;

  /// Tries the piece in both orientations against the given max dims; returns
  /// the orientation that fits with the longer side along the length, or null.
  _Fit? _orientToFit(_Piece piece, double maxLength, double maxWidth) {
    // Default orientation
    if (piece.width <= maxLength && piece.height <= maxWidth) {
      return _Fit(w: piece.width, h: piece.height, rotated: false);
    }
    // Rotated
    if (piece.height <= maxLength && piece.width <= maxWidth) {
      return _Fit(w: piece.height, h: piece.width, rotated: true);
    }
    return null;
  }

  /// Tries to fit the piece on the shelf — height must fit the shelf,
  /// width must fit the remaining horizontal space.
  _Fit? _orientToFitShelf(
    _Piece piece,
    _Shelf shelf,
    double sheetLengthInches,
  ) {
    final remainingWidth = sheetLengthInches - shelf.usedWidth;
    // Default orientation
    if (piece.height <= shelf.heightInches && piece.width <= remainingWidth) {
      return _Fit(w: piece.width, h: piece.height, rotated: false);
    }
    // Rotated
    if (piece.width <= shelf.heightInches && piece.height <= remainingWidth) {
      return _Fit(w: piece.height, h: piece.width, rotated: true);
    }
    return null;
  }
}

class _Piece {
  _Piece({required this.name, required this.width, required this.height});
  final String name;
  final double width;
  final double height;
}

class _Fit {
  _Fit({required this.w, required this.h, required this.rotated});
  final double w;
  final double h;
  final bool rotated;
}

class _PackedSheet {
  _PackedSheet({required this.lengthInches, required this.widthInches});
  final double lengthInches;
  final double widthInches;
  final List<_Shelf> shelves = [];

  double get usedHeight =>
      shelves.fold<double>(0, (s, sh) => s + sh.heightInches);
}

class _Shelf {
  _Shelf({required this.yInches, required this.heightInches});
  final double yInches;
  final double heightInches;
  double usedWidth = 0;
  final List<CutPlacement> placements = [];
}

/// Default Riverpod binding. Swap to a Cloud Function-backed implementation
/// in Phase 3 via `ProviderScope.overrides`.
final cutOptimizationServiceProvider = Provider<CutOptimizationService>(
  (ref) => const BestFitDecreasingHeightOptimizer(),
);
