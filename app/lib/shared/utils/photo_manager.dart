import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// Picks and persists project photos. Files are saved to the app's documents
/// directory under `photos/<projectId>/<timestamp>.jpg`. Paths are returned
/// to the caller, which is responsible for persisting them on the Project.
///
/// Platform setup required (one-time):
/// - iOS: add `NSCameraUsageDescription` and
///   `NSPhotoLibraryUsageDescription` to `ios/Runner/Info.plist`.
/// - Android: add `<uses-permission android:name="android.permission.CAMERA"/>`
///   to `android/app/src/main/AndroidManifest.xml` (storage permissions are
///   only needed for legacy Android <= 9).
class PhotoManager {
  PhotoManager._();

  static const ImagePicker _picker = ImagePicker();

  static Future<String?> captureFromCamera({required String projectId}) async {
    final XFile? file = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 2400,
    );
    if (file == null) return null;
    return _persist(file, projectId);
  }

  static Future<String?> pickFromGallery({required String projectId}) async {
    final XFile? file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 2400,
    );
    if (file == null) return null;
    return _persist(file, projectId);
  }

  static Future<List<String>> pickMultipleFromGallery({
    required String projectId,
  }) async {
    final files = await _picker.pickMultiImage(
      imageQuality: 85,
      maxWidth: 2400,
    );
    final paths = <String>[];
    for (final f in files) {
      paths.add(await _persist(f, projectId));
    }
    return paths;
  }

  static Future<void> deletePhoto(String path) async {
    final file = File(path);
    if (file.existsSync()) {
      await file.delete();
    }
  }

  static Future<String> _persist(XFile file, String projectId) async {
    final docs = await getApplicationDocumentsDirectory();
    final projectDir = Directory('${docs.path}/photos/$projectId');
    if (!projectDir.existsSync()) {
      projectDir.createSync(recursive: true);
    }
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final destPath = '${projectDir.path}/$stamp.jpg';
    await file.saveTo(destPath);
    return destPath;
  }
}
