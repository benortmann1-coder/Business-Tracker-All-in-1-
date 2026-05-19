import 'quote_line_item.dart';

/// A pre-built starter quote a user can apply to skip the blank-canvas
/// problem. Brad and Jamie asked for these by trade.
class QuoteTemplate {
  const QuoteTemplate({
    required this.name,
    required this.description,
    required this.lineItems,
    this.laborHours = 0,
    this.markupPercent = 25,
  });

  final String name;
  final String description;
  final List<QuoteLineItem> lineItems;
  final double laborHours;
  final double markupPercent;
}

/// Curated starter set per common trade. Numbers are conservative placeholder
/// pricing — users will overwrite with their actuals.
final List<QuoteTemplate> kQuoteTemplates = [
  QuoteTemplate(
    name: 'Floating shelf (single bay)',
    description:
        '4ft × 10in walnut floating shelf with hidden steel bracket.',
    laborHours: 3,
    markupPercent: 30,
    lineItems: [
      QuoteLineItem(
        description: '4/4 walnut, 4ft × 10in',
        quantity: 3.3,
        unit: 'bf',
        unitCostCents: 1400,
      ),
      QuoteLineItem(
        description: 'Hidden steel bracket (anchor + rod)',
        quantity: 1,
        unit: 'each',
        unitCostCents: 4500,
        category: QuoteLineCategory.hardware,
      ),
      QuoteLineItem(
        description: 'Hand-rubbed oil finish',
        quantity: 1,
        unit: 'each',
        unitCostCents: 1200,
        category: QuoteLineCategory.finish,
      ),
    ],
  ),
  QuoteTemplate(
    name: 'Built-in bookcase (8ft, walnut)',
    description: '8ft tall × 36in wide × 12in deep walnut bookcase with five '
        'fixed shelves.',
    laborHours: 22,
    markupPercent: 28,
    lineItems: [
      QuoteLineItem(
        description: '3/4" walnut plywood, 4×8 sheet',
        quantity: 2,
        unit: 'sheet',
        unitCostCents: 18500,
      ),
      QuoteLineItem(
        description: '1/4" walnut plywood (back panel)',
        quantity: 1,
        unit: 'sheet',
        unitCostCents: 12000,
      ),
      QuoteLineItem(
        description: 'Walnut edge banding',
        quantity: 50,
        unit: 'lf',
        unitCostCents: 150,
      ),
      QuoteLineItem(
        description: 'Shelf pins (set of 20)',
        quantity: 1,
        unit: 'each',
        unitCostCents: 800,
        category: QuoteLineCategory.hardware,
      ),
      QuoteLineItem(
        description: 'Pre-catalyzed lacquer (gallon)',
        quantity: 1,
        unit: 'each',
        unitCostCents: 8500,
        category: QuoteLineCategory.finish,
      ),
    ],
  ),
  QuoteTemplate(
    name: 'Garage slat wall + 12 hooks',
    description: '8ft slat wall panel set with 12 utility hooks, installed.',
    laborHours: 4,
    markupPercent: 35,
    lineItems: [
      QuoteLineItem(
        description: '8ft slat wall panel',
        quantity: 4,
        unit: 'each',
        unitCostCents: 4500,
      ),
      QuoteLineItem(
        description: 'Utility hook',
        quantity: 12,
        unit: 'each',
        unitCostCents: 800,
        category: QuoteLineCategory.hardware,
      ),
      QuoteLineItem(
        description: 'Lag bolts (1/4" × 3", into studs)',
        quantity: 24,
        unit: 'each',
        unitCostCents: 75,
        category: QuoteLineCategory.hardware,
      ),
    ],
  ),
  QuoteTemplate(
    name: 'Overhead garage rack pair',
    description: '4×8 ceiling-mounted storage rack, two units installed.',
    laborHours: 3,
    markupPercent: 35,
    lineItems: [
      QuoteLineItem(
        description: '4×8 overhead rack (kit)',
        quantity: 2,
        unit: 'each',
        unitCostCents: 17500,
      ),
      QuoteLineItem(
        description: 'Joist hanger set',
        quantity: 2,
        unit: 'each',
        unitCostCents: 1200,
        category: QuoteLineCategory.hardware,
      ),
    ],
  ),
  QuoteTemplate(
    name: 'Walnut dining table (custom)',
    description: '8ft × 42in walnut dining table, hand-rubbed oil finish, '
        'breadboard ends, trestle base.',
    laborHours: 48,
    markupPercent: 30,
    lineItems: [
      QuoteLineItem(
        description: '8/4 walnut slab (24bf rough)',
        quantity: 24,
        unit: 'bf',
        unitCostCents: 1800,
      ),
      QuoteLineItem(
        description: '8/4 walnut for trestle base',
        quantity: 12,
        unit: 'bf',
        unitCostCents: 1800,
      ),
      QuoteLineItem(
        description: 'Domino tenons + drawbore pegs',
        quantity: 1,
        unit: 'each',
        unitCostCents: 2500,
        category: QuoteLineCategory.hardware,
      ),
      QuoteLineItem(
        description: 'Rubio Monocoat (oil finish)',
        quantity: 1,
        unit: 'each',
        unitCostCents: 6500,
        category: QuoteLineCategory.finish,
      ),
      QuoteLineItem(
        description: 'White-glove local delivery',
        quantity: 1,
        unit: 'each',
        unitCostCents: 25000,
        category: QuoteLineCategory.delivery,
      ),
    ],
  ),
  QuoteTemplate(
    name: 'Kitchen cabinet run (linear ft)',
    description: 'Quote-by-linear-foot starting point. Update LF and add doors '
        'per actual layout.',
    laborHours: 0,
    markupPercent: 25,
    lineItems: [
      QuoteLineItem(
        description: 'Base cabinet (per linear foot)',
        quantity: 10,
        unit: 'lf',
        unitCostCents: 32000,
      ),
      QuoteLineItem(
        description: 'Upper cabinet (per linear foot)',
        quantity: 10,
        unit: 'lf',
        unitCostCents: 24000,
      ),
      QuoteLineItem(
        description: 'Blum soft-close hinges',
        quantity: 24,
        unit: 'each',
        unitCostCents: 950,
        category: QuoteLineCategory.hardware,
      ),
      QuoteLineItem(
        description: 'Blum Tandem drawer slides 18"',
        quantity: 8,
        unit: 'each',
        unitCostCents: 2800,
        category: QuoteLineCategory.hardware,
      ),
    ],
  ),
];
