/// A proposed substitution for a material in a project.
class MaterialSubstitution {
  const MaterialSubstitution({
    required this.originalName,
    required this.suggestedName,
    required this.estimatedSavingsCents,
    required this.rationale,
  });

  final String originalName;
  final String suggestedName;
  final int estimatedSavingsCents;
  final String rationale;
}

/// Calls an LLM (Claude / GPT) hosted behind a Cloud Function callable named
/// `suggestMaterialSubstitutions` to propose cost-saving substitutions for the
/// materials in a project.
///
/// Stubbed in Phase 1 so the rest of the app can wire the UI; the real
/// implementation lives behind a Cloud Functions HTTPS callable in Phase 3.
abstract interface class MaterialSubstitutionService {
  Future<List<MaterialSubstitution>> suggest({
    required List<String> materialNames,
    required String region,
    required String projectType,
  });
}

class NoopMaterialSubstitutionService implements MaterialSubstitutionService {
  const NoopMaterialSubstitutionService();

  @override
  Future<List<MaterialSubstitution>> suggest({
    required List<String> materialNames,
    required String region,
    required String projectType,
  }) async => const [];
}
