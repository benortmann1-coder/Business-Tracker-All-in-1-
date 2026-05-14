enum ProjectStatus {
  draft('Draft'),
  inProgress('In Progress'),
  awaitingApproval('Awaiting Approval'),
  completed('Completed'),
  delivered('Delivered'),
  overdue('Overdue');

  const ProjectStatus(this.label);

  final String label;

  static ProjectStatus fromJson(String value) => ProjectStatus.values
      .firstWhere((s) => s.name == value, orElse: () => ProjectStatus.draft);

  String toJson() => name;
}
