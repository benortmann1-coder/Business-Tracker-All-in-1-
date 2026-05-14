enum TeamRole { owner, admin, member, viewer }

extension TeamRoleExt on TeamRole {
  String get label {
    switch (this) {
      case TeamRole.owner:
        return 'Owner';
      case TeamRole.admin:
        return 'Admin';
      case TeamRole.member:
        return 'Member';
      case TeamRole.viewer:
        return 'Viewer';
    }
  }
}

class TeamMember {
  TeamMember({
    required this.uid,
    required this.displayName,
    required this.email,
    required this.role,
    DateTime? joinedAt,
  }) : joinedAt = joinedAt ?? DateTime.now();

  final String uid;
  final String displayName;
  final String email;
  final TeamRole role;
  final DateTime joinedAt;
}
