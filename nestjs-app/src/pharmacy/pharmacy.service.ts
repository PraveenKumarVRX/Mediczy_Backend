import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';
import { cacheGet, cacheSet } from '../../../server/config/redis-hardened.js';

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Drug search ────────────────────────────────────────────────────────────

  async searchDrugs(query: string, page = 1, limit = 20) {
    const cacheKey = `drugs:search:${query}:${page}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.$queryRaw<any[]>`
      SELECT pi.id, pi.drug_name, pi.generic_name, pi.brand_name,
             pi.category, pi.unit_price, pi.stock_quantity,
             pi.requires_prescription, p.name AS pharmacy_name, p.id AS pharmacy_id
      FROM pharmacy_inventory pi
      JOIN pharmacies p ON p.id = pi.pharmacy_id
      WHERE pi.is_active = TRUE
        AND (
          pi.drug_name    ILIKE ${'%' + query + '%'} OR
          pi.generic_name ILIKE ${'%' + query + '%'} OR
          pi.brand_name   ILIKE ${'%' + query + '%'}
        )
      ORDER BY pi.stock_quantity DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    await cacheSet(cacheKey, result, 300);
    return result;
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async getInventory(pharmacyId: number, lowStockOnly = false) {
    return this.prisma.$queryRaw<any[]>`
      SELECT id, drug_name, generic_name, brand_name, category,
             unit_price, stock_quantity, reorder_level, expiry_date,
             requires_prescription, is_active
      FROM pharmacy_inventory
      WHERE pharmacy_id = ${pharmacyId}
        ${lowStockOnly ? 'AND stock_quantity <= reorder_level' : ''}
      ORDER BY expiry_date ASC NULLS LAST, drug_name
    `;
  }

  async updateStock(pharmacyId: number, inventoryId: number, adjustment: number, reason: string) {
    const [item] = await this.prisma.$queryRaw<any[]>`
      UPDATE pharmacy_inventory
      SET stock_quantity = stock_quantity + ${adjustment},
          updated_at = NOW()
      WHERE id = ${inventoryId} AND pharmacy_id = ${pharmacyId}
      RETURNING *
    `;
    if (!item) throw new NotFoundException('Inventory item not found');
    if (item.stock_quantity < 0) throw new BadRequestException('Insufficient stock');
    return item;
  }

  // ── Prescription dispensing ────────────────────────────────────────────────

  async dispensePrescription(pharmacyId: number, staffId: number, data: {
    prescriptionId: number;
    patientId:      number;
    items:          { inventoryId: number; quantity: number; unitPrice: number }[];
    notes?:         string;
  }) {
    const totalAmount = data.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    // Deduct stock for each item
    for (const item of data.items) {
      await this.updateStock(pharmacyId, item.inventoryId, -item.quantity, 'dispensed');
    }

    const [dispensing] = await this.prisma.$queryRaw<any[]>`
      INSERT INTO prescription_dispensings
        (prescription_id, pharmacy_id, dispensed_by, patient_id, items,
         total_amount, status, dispensed_at, notes)
      VALUES (
        ${data.prescriptionId}, ${pharmacyId}, ${staffId},
        ${data.patientId}, ${JSON.stringify(data.items)}::jsonb,
        ${totalAmount}, 'dispensed', NOW(), ${data.notes || null}
      )
      RETURNING *
    `;

    await publishEvent(KAFKA_TOPICS.PRESCRIPTION_CREATED, {
      dispensingId:   dispensing.id,
      prescriptionId: data.prescriptionId,
      patientId:      data.patientId,
      pharmacyId,
    }).catch(() => {});

    return dispensing;
  }

  async getDispensings(pharmacyId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    return this.prisma.$queryRaw<any[]>`
      SELECT pd.*, u.email AS patient_email,
             u."firstName" || ' ' || u."lastName" AS patient_name
      FROM prescription_dispensings pd
      LEFT JOIN users u ON u.id = pd.patient_id
      WHERE pd.pharmacy_id = ${pharmacyId}
      ORDER BY pd.dispensed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  async getExpiryAlerts(pharmacyId: number, daysAhead = 30) {
    return this.prisma.$queryRaw<any[]>`
      SELECT drug_name, generic_name, stock_quantity, expiry_date,
             expiry_date - CURRENT_DATE AS days_to_expiry
      FROM pharmacy_inventory
      WHERE pharmacy_id = ${pharmacyId}
        AND expiry_date IS NOT NULL
        AND expiry_date <= CURRENT_DATE + ${daysAhead}
        AND stock_quantity > 0
        AND is_active = TRUE
      ORDER BY expiry_date
    `;
  }
}
