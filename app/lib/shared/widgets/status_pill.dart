import 'package:flutter/material.dart';

import '../../core/theme/colors.dart';
import '../models/project_status.dart';

class StatusPill extends StatelessWidget {
  const StatusPill({required this.status, super.key});

  final ProjectStatus status;

  @override
  Widget build(BuildContext context) {
    final s = _styleFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: s.background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(s.icon, size: 14, color: s.foreground),
          const SizedBox(width: 6),
          Text(
            status.label,
            style: TextStyle(
              color: s.foreground,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  ({Color background, Color foreground, IconData icon}) _styleFor(
    ProjectStatus s,
  ) {
    switch (s) {
      case ProjectStatus.draft:
        return (
          background: AppColors.steel500,
          foreground: AppColors.cream100,
          icon: Icons.edit_outlined,
        );
      case ProjectStatus.inProgress:
        return (
          background: AppColors.forest600,
          foreground: AppColors.cream100,
          icon: Icons.handyman_outlined,
        );
      case ProjectStatus.awaitingApproval:
        return (
          background: AppColors.amber500,
          foreground: AppColors.cream100,
          icon: Icons.hourglass_top_outlined,
        );
      case ProjectStatus.completed:
        return (
          background: AppColors.forest600,
          foreground: AppColors.cream100,
          icon: Icons.check_circle_outline,
        );
      case ProjectStatus.delivered:
        return (
          background: AppColors.walnut700,
          foreground: AppColors.cream100,
          icon: Icons.local_shipping_outlined,
        );
      case ProjectStatus.overdue:
        return (
          background: AppColors.crimson600,
          foreground: AppColors.cream100,
          icon: Icons.warning_amber_outlined,
        );
    }
  }
}
