import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Press-to-talk voice capture sheet that returns the final transcribed text.
/// Hank's review: "gloves on, hands covered in shellac, talk to it."
///
/// Platform setup required (one-time):
/// - iOS: add `NSSpeechRecognitionUsageDescription` and
///   `NSMicrophoneUsageDescription` to `ios/Runner/Info.plist`.
/// - Android: add `<uses-permission android:name="android.permission.RECORD_AUDIO"/>`
///   to `android/app/src/main/AndroidManifest.xml`.
class VoiceCaptureSheet extends StatefulWidget {
  const VoiceCaptureSheet({this.initialText = '', super.key});

  final String initialText;

  static Future<String?> show(BuildContext context, {String initialText = ''}) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => VoiceCaptureSheet(initialText: initialText),
    );
  }

  @override
  State<VoiceCaptureSheet> createState() => _VoiceCaptureSheetState();
}

class _VoiceCaptureSheetState extends State<VoiceCaptureSheet> {
  late final SpeechToText _speech;
  late final TextEditingController _text;
  bool _speechReady = false;
  bool _listening = false;
  String _status = '';

  @override
  void initState() {
    super.initState();
    _speech = SpeechToText();
    _text = TextEditingController(text: widget.initialText);
    _initSpeech();
  }

  @override
  void dispose() {
    _speech.cancel();
    _text.dispose();
    super.dispose();
  }

  Future<void> _initSpeech() async {
    final available = await _speech.initialize(
      onStatus: (s) {
        if (mounted) {
          setState(() {
            _status = s;
            if (s == 'notListening' || s == 'done') _listening = false;
          });
        }
      },
      onError: (e) {
        if (mounted) {
          setState(() {
            _status = 'Error: ${e.errorMsg}';
            _listening = false;
          });
        }
      },
    );
    if (mounted) setState(() => _speechReady = available);
  }

  Future<void> _toggleListening() async {
    if (!_speechReady) return;
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    final priorText = _text.text;
    await _speech.listen(
      onResult: (r) {
        if (!mounted) return;
        final addition = r.recognizedWords;
        final joined = priorText.isEmpty ? addition : '$priorText $addition';
        setState(() => _text.text = joined);
        _text.selection =
            TextSelection.collapsed(offset: _text.text.length);
      },
      listenFor: const Duration(minutes: 2),
      pauseFor: const Duration(seconds: 6),
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
      ),
    );
    setState(() => _listening = true);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: t.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text('Voice note', style: t.textTheme.headlineMedium),
            const SizedBox(height: 4),
            Text(
              'Tap the mic, speak, then tap again to stop. Edit the text '
              'below before saving.',
              style: t.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _text,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'Transcript',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: FloatingActionButton.large(
                onPressed: _speechReady ? _toggleListening : null,
                backgroundColor: _listening
                    ? t.colorScheme.error
                    : t.colorScheme.primary,
                child: Icon(
                  _listening ? Icons.stop : Icons.mic,
                  size: 36,
                  color: t.colorScheme.onPrimary,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                _speechReady
                    ? (_listening ? 'Listening…' : 'Tap to start')
                    : 'Voice recognition not available on this device',
                style: t.textTheme.bodySmall,
              ),
            ),
            if (_status.startsWith('Error'))
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Center(
                  child: Text(
                    _status,
                    style: t.textTheme.bodySmall?.copyWith(
                      color: t.colorScheme.error,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                final text = _text.text.trim();
                Navigator.of(context).pop(text.isEmpty ? null : text);
              },
              child: const Text('Save'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }
}
