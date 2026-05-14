import 'package:uuid/uuid.dart';

enum CncFileFormat { dxf, svg, cnc, nc, gcode, tap }

extension CncFileFormatExt on CncFileFormat {
  String get label => name.toUpperCase();

  static CncFileFormat fromExtension(String ext) {
    final lower = ext.toLowerCase().replaceAll('.', '');
    return CncFileFormat.values.firstWhere(
      (f) => f.name == lower,
      orElse: () => CncFileFormat.cnc,
    );
  }
}

class CncFile {
  CncFile({
    required this.filename,
    required this.format,
    required this.bytes,
    String? id,
    this.projectId,
    this.storagePath,
    this.thumbnailPath,
    this.tags = const [],
    DateTime? uploadedAt,
  })  : id = id ?? const Uuid().v4(),
        uploadedAt = uploadedAt ?? DateTime.now();

  final String id;
  final String filename;
  final CncFileFormat format;
  final int bytes;
  final String? projectId;
  final String? storagePath;
  final String? thumbnailPath;
  final List<String> tags;
  final DateTime uploadedAt;

  String get displaySize {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  }
}
