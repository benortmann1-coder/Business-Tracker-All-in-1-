import 'package:uuid/uuid.dart';

enum GrainDirection { length, width, none }

class CutListItem {
  CutListItem({
    required this.partName,
    required this.materialId,
    required this.lengthInches,
    required this.widthInches,
    String? id,
    this.quantity = 1,
    this.grainDirection = GrainDirection.length,
  }) : id = id ?? const Uuid().v4();

  final String id;
  final String partName;
  final String materialId;
  final double lengthInches;
  final double widthInches;
  final int quantity;
  final GrainDirection grainDirection;

  double get squareInches => lengthInches * widthInches * quantity;
}
