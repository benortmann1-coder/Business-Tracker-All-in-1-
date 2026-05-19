import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:signature/signature.dart';

class SignatureCaptureScreen extends StatefulWidget {
  const SignatureCaptureScreen({required this.quoteId, super.key});

  final String quoteId;

  /// Pushes the signature screen. Returns the path to the saved PNG, or null
  /// if the user cancelled.
  static Future<String?> capture(BuildContext context, {required String quoteId}) {
    return Navigator.of(context).push<String>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => SignatureCaptureScreen(quoteId: quoteId),
      ),
    );
  }

  @override
  State<SignatureCaptureScreen> createState() => _SignatureCaptureScreenState();
}

class _SignatureCaptureScreenState extends State<SignatureCaptureScreen> {
  late final SignatureController _controller;

  @override
  void initState() {
    super.initState();
    _controller = SignatureController(
      penStrokeWidth: 3,
      penColor: Colors.black,
      exportBackgroundColor: Colors.white,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_controller.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in the box, then tap Save')),
      );
      return;
    }
    final png = await _controller.toPngBytes();
    if (png == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not capture signature, try again')),
      );
      return;
    }
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/signatures');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final file = File('${dir.path}/${widget.quoteId}_$stamp.png');
    await file.writeAsBytes(png);
    if (!mounted) return;
    Navigator.of(context).pop(file.path);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Client signature'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          TextButton(
            onPressed: () => _controller.clear(),
            child: const Text('Clear'),
          ),
          TextButton(
            onPressed: _save,
            child: const Text('Save'),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Card(
                color: t.colorScheme.surfaceContainerHighest
                    .withValues(alpha: 0.5),
                child: const Padding(
                  padding: EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Hand the device to your client and have them sign '
                          'below. Rotate landscape for more room.',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: t.dividerColor, width: 1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Signature(
                    controller: _controller,
                    backgroundColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _controller.clear(),
                      child: const Text('Clear'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _save,
                      child: const Text('Save signature'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
