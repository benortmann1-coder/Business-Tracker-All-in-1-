import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/utils/photo_manager.dart';
import '../../../shared/widgets/empty_state.dart';
import '../data/project_repository.dart';

class ProjectPhotosScreen extends ConsumerWidget {
  const ProjectPhotosScreen({required this.projectId, super.key});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectProvider(projectId));

    Future<void> addPhotos(WidgetRef ref) async {
      final source = await showModalBottomSheet<String>(
        context: context,
        builder: (_) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take a photo'),
                onTap: () => Navigator.of(context).pop('camera'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Pick from library (multiple)'),
                onTap: () => Navigator.of(context).pop('gallery-multi'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_outlined),
                title: const Text('Pick one photo'),
                onTap: () => Navigator.of(context).pop('gallery-one'),
              ),
            ],
          ),
        ),
      );
      if (source == null) return;
      final newPaths = <String>[];
      switch (source) {
        case 'camera':
          final p =
              await PhotoManager.captureFromCamera(projectId: projectId);
          if (p != null) newPaths.add(p);
        case 'gallery-one':
          final p =
              await PhotoManager.pickFromGallery(projectId: projectId);
          if (p != null) newPaths.add(p);
        case 'gallery-multi':
          newPaths.addAll(
            await PhotoManager.pickMultipleFromGallery(projectId: projectId),
          );
      }
      if (newPaths.isEmpty) return;
      final repo = ref.read(projectRepositoryProvider);
      final current = await repo.get(projectId);
      if (current == null) return;
      await repo.upsert(
        current.copyWith(
          photoPaths: [...current.photoPaths, ...newPaths],
          updatedAt: DateTime.now(),
        ),
      );
      ref.invalidate(projectProvider(projectId));
    }

    Future<void> removePhoto(String path) async {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Remove photo?'),
          content: const Text(
            'This deletes the photo from your device. It cannot be undone.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton.tonal(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Remove'),
            ),
          ],
        ),
      );
      if (confirm != true) return;
      await PhotoManager.deletePhoto(path);
      final repo = ref.read(projectRepositoryProvider);
      final current = await repo.get(projectId);
      if (current == null) return;
      await repo.upsert(
        current.copyWith(
          photoPaths: current.photoPaths.where((p) => p != path).toList(),
          updatedAt: DateTime.now(),
        ),
      );
      ref.invalidate(projectProvider(projectId));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Photos & drawings')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('Add'),
        onPressed: () => addPhotos(ref),
      ),
      body: projectAsync.when(
        data: (project) {
          if (project == null) {
            return const Center(child: Text('Project not found'));
          }
          final paths = project.photoPaths;
          if (paths.isEmpty) {
            return EmptyState(
              icon: Icons.add_a_photo_outlined,
              title: 'No photos yet',
              subtitle:
                  'Snap progress shots, shop drawings, or finished pieces. '
                  'Tagged to this project, viewable later.',
              actionLabel: '+ Add photos',
              onAction: () => addPhotos(ref),
            );
          }
          return GridView.builder(
            padding: const EdgeInsets.all(8),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: paths.length,
            itemBuilder: (_, i) {
              final path = paths[i];
              return GestureDetector(
                onTap: () => _showFullscreen(context, path, () {
                  Navigator.of(context).pop();
                  removePhoto(path);
                }),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(path),
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      child: const Icon(Icons.broken_image_outlined),
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  void _showFullscreen(BuildContext context, String path, VoidCallback onRemove) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.of(context).pop(),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Remove photo',
                onPressed: onRemove,
              ),
            ],
          ),
          body: Center(
            child: InteractiveViewer(
              child: Image.file(File(path)),
            ),
          ),
        ),
      ),
    );
  }
}
