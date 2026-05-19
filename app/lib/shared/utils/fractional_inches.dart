/// Formatting and parsing helpers for fractional inches.
///
/// Hank's review said decimal inches (`37.5`) read wrong in a shop —
/// woodworkers write `37 1/2"`. These helpers cover both directions so the
/// UI can display fractions while storing doubles.

/// Returns a human-readable inch string like `13 1/16"`, `7"`, or `3/8"`.
/// Rounds to the nearest 1/[denominator] (default 16ths).
String formatInchesFractional(double inches, {int denominator = 16}) {
  if (inches.isNaN || inches.isInfinite) return '0"';
  if (inches < 0) {
    return '-${formatInchesFractional(-inches, denominator: denominator)}';
  }
  final whole = inches.floor();
  final frac = inches - whole;
  final raw = (frac * denominator).round();
  if (raw == 0) return '$whole"';
  if (raw == denominator) return '${whole + 1}"';
  final g = _gcd(raw, denominator);
  final n = raw ~/ g;
  final d = denominator ~/ g;
  if (whole == 0) return '$n/$d"';
  return '$whole $n/$d"';
}

/// Parses common inch entry forms: `13`, `13.5`, `13 1/2`, `1/2`, `37 1/16"`.
/// Returns null if the input can't be interpreted.
double? parseInchesFractional(String input) {
  var s = input.trim();
  if (s.isEmpty) return null;
  if (s.endsWith('"')) s = s.substring(0, s.length - 1).trim();
  // Whole number or decimal
  final asDouble = double.tryParse(s);
  if (asDouble != null) return asDouble;
  // Mixed: "W N/D"
  final mixed = RegExp(r'^(\d+)\s+(\d+)\s*/\s*(\d+)$').firstMatch(s);
  if (mixed != null) {
    final w = int.parse(mixed.group(1)!);
    final n = int.parse(mixed.group(2)!);
    final d = int.parse(mixed.group(3)!);
    if (d == 0) return null;
    return w + n / d;
  }
  // Plain fraction: "N/D"
  final pure = RegExp(r'^(\d+)\s*/\s*(\d+)$').firstMatch(s);
  if (pure != null) {
    final n = int.parse(pure.group(1)!);
    final d = int.parse(pure.group(2)!);
    if (d == 0) return null;
    return n / d;
  }
  return null;
}

int _gcd(int a, int b) => b == 0 ? a : _gcd(b, a % b);
