import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Single source of truth for which paid features the current user has access
/// to. Backed by a stub in Phase 1; wire to App Store / Google Play receipt
/// validation (`validatePurchaseReceipt` Cloud Function) in Phase 2.
class Entitlements {
  const Entitlements({
    this.cloudSyncActive = false,
    this.cncOwned = false,
    this.teamActive = false,
  });

  final bool cloudSyncActive;
  final bool cncOwned;
  final bool teamActive;

  Entitlements copyWith({
    bool? cloudSyncActive,
    bool? cncOwned,
    bool? teamActive,
  }) =>
      Entitlements(
        cloudSyncActive: cloudSyncActive ?? this.cloudSyncActive,
        cncOwned: cncOwned ?? this.cncOwned,
        teamActive: teamActive ?? this.teamActive,
      );
}

/// Phase 1 default: nothing unlocked. Override in tests or after a successful
/// purchase / subscription validation.
final entitlementsProvider = Provider<Entitlements>(
  (ref) => const Entitlements(),
);
