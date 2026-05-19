/// Per-shop preferences used as defaults across the app — quote letterheads,
/// new-quote markup/labor rate, invoice tax. Stored in SharedPreferences as a
/// single JSON blob keyed by [kShopSettingsKey].
class ShopSettings {
  const ShopSettings({
    this.shopName = 'My Shop',
    this.shopAddress,
    this.shopPhone,
    this.shopEmail,
    this.licenseNumber,
    this.defaultMarkupPercent = 25,
    this.defaultLaborRateCents = 7500,
    this.defaultTaxPercent = 0,
  });

  factory ShopSettings.fromJson(Map<String, dynamic> json) => ShopSettings(
        shopName: json['shopName'] as String? ?? 'My Shop',
        shopAddress: json['shopAddress'] as String?,
        shopPhone: json['shopPhone'] as String?,
        shopEmail: json['shopEmail'] as String?,
        licenseNumber: json['licenseNumber'] as String?,
        defaultMarkupPercent:
            (json['defaultMarkupPercent'] as num?)?.toDouble() ?? 25,
        defaultLaborRateCents:
            (json['defaultLaborRateCents'] as num?)?.toInt() ?? 7500,
        defaultTaxPercent:
            (json['defaultTaxPercent'] as num?)?.toDouble() ?? 0,
      );

  final String shopName;
  final String? shopAddress;
  final String? shopPhone;
  final String? shopEmail;
  final String? licenseNumber;
  final double defaultMarkupPercent;
  final int defaultLaborRateCents;
  final double defaultTaxPercent;

  ShopSettings copyWith({
    String? shopName,
    String? shopAddress,
    bool setShopAddressToNull = false,
    String? shopPhone,
    bool setShopPhoneToNull = false,
    String? shopEmail,
    bool setShopEmailToNull = false,
    String? licenseNumber,
    bool setLicenseNumberToNull = false,
    double? defaultMarkupPercent,
    int? defaultLaborRateCents,
    double? defaultTaxPercent,
  }) =>
      ShopSettings(
        shopName: shopName ?? this.shopName,
        shopAddress:
            setShopAddressToNull ? null : (shopAddress ?? this.shopAddress),
        shopPhone: setShopPhoneToNull ? null : (shopPhone ?? this.shopPhone),
        shopEmail: setShopEmailToNull ? null : (shopEmail ?? this.shopEmail),
        licenseNumber: setLicenseNumberToNull
            ? null
            : (licenseNumber ?? this.licenseNumber),
        defaultMarkupPercent: defaultMarkupPercent ?? this.defaultMarkupPercent,
        defaultLaborRateCents:
            defaultLaborRateCents ?? this.defaultLaborRateCents,
        defaultTaxPercent: defaultTaxPercent ?? this.defaultTaxPercent,
      );

  Map<String, dynamic> toJson() => {
        'shopName': shopName,
        'shopAddress': shopAddress,
        'shopPhone': shopPhone,
        'shopEmail': shopEmail,
        'licenseNumber': licenseNumber,
        'defaultMarkupPercent': defaultMarkupPercent,
        'defaultLaborRateCents': defaultLaborRateCents,
        'defaultTaxPercent': defaultTaxPercent,
      };
}

const String kShopSettingsKey = 'shop_settings_v1';
