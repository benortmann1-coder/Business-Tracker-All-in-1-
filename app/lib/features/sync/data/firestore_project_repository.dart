import 'package:cloud_firestore/cloud_firestore.dart';

import '../../projects/data/project_repository.dart';
import '../../projects/domain/project.dart';

/// Cloud-backed implementation of [ProjectRepository].
///
/// Wire this in by overriding [projectRepositoryProvider] in a ProviderScope
/// once the user authenticates and has an active Cloud Sync subscription:
///
/// ```dart
/// ProviderScope(
///   overrides: [
///     projectRepositoryProvider.overrideWithValue(
///       FirestoreProjectRepository(
///         firestore: FirebaseFirestore.instance,
///         uid: user.uid,
///       ),
///     ),
///   ],
///   child: const BevelryApp(),
/// );
/// ```
class FirestoreProjectRepository implements ProjectRepository {
  FirestoreProjectRepository({
    required FirebaseFirestore firestore,
    required String uid,
  })  : _firestore = firestore,
        _uid = uid;

  static const _tsFields = <String>{
    'createdAt',
    'updatedAt',
    'dueDate',
    'deletedAt',
  };

  final FirebaseFirestore _firestore;
  final String _uid;

  CollectionReference<Map<String, dynamic>> get _collection =>
      _firestore.collection('users').doc(_uid).collection('projects');

  @override
  Future<List<Project>> list() async {
    final snapshot = await _collection
        .where('deletedAt', isNull: true)
        .orderBy('createdAt', descending: true)
        .get();
    return snapshot.docs
        .map((d) => Project.fromJson(_normalizeRead(d.data())))
        .toList();
  }

  @override
  Future<Project?> get(String id) async {
    final doc = await _collection.doc(id).get();
    final data = doc.data();
    if (data == null) return null;
    final normalized = _normalizeRead(data);
    if (normalized['deletedAt'] != null) return null;
    return Project.fromJson(normalized);
  }

  @override
  Future<void> upsert(Project project) async {
    final payload = _normalizeWrite(project.toJson())
      ..['updatedAt'] = FieldValue.serverTimestamp();
    await _collection.doc(project.id).set(payload, SetOptions(merge: true));
  }

  @override
  Future<void> delete(String id) async {
    await _collection.doc(id).update({
      'deletedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Firestore returns [Timestamp] for date fields; [Project.fromJson] expects
  /// ISO 8601 strings. Normalize before deserializing.
  Map<String, dynamic> _normalizeRead(Map<String, dynamic> data) {
    final result = Map<String, dynamic>.from(data);
    for (final key in _tsFields) {
      final value = data[key];
      if (value is Timestamp) {
        result[key] = value.toDate().toIso8601String();
      }
    }
    return result;
  }

  /// [Project.toJson] emits ISO 8601 strings; Firestore should store
  /// [Timestamp] so `orderBy(createdAt)` and range queries work.
  Map<String, dynamic> _normalizeWrite(Map<String, dynamic> data) {
    final result = Map<String, dynamic>.from(data);
    for (final key in _tsFields) {
      final value = data[key];
      if (value is String) {
        result[key] = Timestamp.fromDate(DateTime.parse(value));
      }
    }
    return result;
  }
}
