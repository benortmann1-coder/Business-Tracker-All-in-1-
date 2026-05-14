import 'package:flutter/material.dart';

import '../../../shared/widgets/paywall_gate.dart';

class CncFilesScreen extends StatelessWidget {
  const CncFilesScreen({this.projectId, this.unlocked = false, super.key});

  final String? projectId;
  final bool unlocked;

  @override
  Widget build(BuildContext context) {
    if (!unlocked) {
      return Scaffold(
        appBar: AppBar(title: const Text('CNC Files')),
        body: const PaywallGate(
          featureName: 'CNC File Manager',
          tagline:
              'Upload, organize, and preview CNC files inside each project.',
          icon: Icons.precision_manufacturing_outlined,
          price: r'$14.99',
          bullets: [
            'DXF, SVG, and G-code support',
            'Auto-generated previews',
            'Tag and filter by format or status',
            'One-time purchase — you own it',
          ],
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('CNC Files'),
        actions: [
          IconButton(
            icon: const Icon(Icons.upload_file_outlined),
            tooltip: 'Upload CNC file',
            onPressed: () {},
          ),
        ],
      ),
      body: const Center(
        child: Text('No files yet. Tap upload to add one.'),
      ),
    );
  }
}
