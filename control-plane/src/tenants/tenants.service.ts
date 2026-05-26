import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const PLAN_TIERS: Record<string, any> = {
  free: {
    name: 'Free', database_isolation: false, dedicated_server: false,
    subdomain: true, custom_domain: false,
    limits: { users: 10, doctors: 3, patients: 500, storage_gb: 5 },
    features: { telemedicine: true, basic_emr: true, appointments: true },
    price: { monthly: 0 },
  },
  professional: {
    name: 'Professional', database_isolation: true, dedicated_server: false,
    subdomain: true, custom_domain: true,
    limits: { users: 100, doctors: 25, patients: 10000, storage_gb: 100 },
    features: { telemedicine: true, full_emr: true, appointments: true, api_access: true, analytics: true },
    price: { monthly: 9999 },
  },
  enterprise: {
    name: 'Enterprise', database_isolation: true, dedicated_server: true,
    subdomain: true, custom_domain: true,
    limits: { users: -1, doctors: -1, patients: -1, storage_gb: -1 },
    features: { telemedicine: true, full_emr: true, appointments: true, api_access: true, analytics: true, white_label: true, sla: true },
    price: { monthly: 49999 },
  },
};

const MIN_PLAN: Record<string, string> = {
  hospital: 'professional', ambulance: 'professional',
  corporate: 'professional', homecare: 'professional', broker: 'professional',
  tpa: 'enterprise', psu: 'enterprise', insurer: 'enterprise',
};
const PLAN_RANK: Record<string, number> = { free: 0, professional: 1, enterprise: 2 };

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private repo: Repository<Tenant>) {}

  async findAll(q: { page?: number; limit?: number; type?: string; plan?: string; status?: string; search?: string }) {
    const { page = 1, limit = 20, type, plan, status, search } = q;
    const qb = this.repo.createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    if (type) qb.andWhere('t.type = :type', { type });
    if (plan) qb.andWhere('t.plan = :plan', { plan });
    if (status) qb.andWhere('t.status = :status', { status });
    if (search) qb.andWhere('(t.name ILIKE :s OR t.slug ILIKE :s OR t.email ILIKE :s OR t.subdomain ILIKE :s)', { s: `%${search}%` });
    const [tenants, total] = await qb.getManyAndCount();
    return {
      success: true,
      tenants: tenants.map(t => ({
        ...t,
        tier: { name: PLAN_TIERS[t.plan]?.name || t.plan, database_isolation: PLAN_TIERS[t.plan]?.database_isolation || false, dedicated_server: PLAN_TIERS[t.plan]?.dedicated_server || false },
        access_url: t.custom_domain ? `https://${t.custom_domain}` : t.subdomain ? `https://${t.subdomain}.mediqzy.com` : null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const [total, active] = await Promise.all([this.repo.count(), this.repo.count({ where: { status: 'active' } })]);
    const byPlan = await this.repo.createQueryBuilder('t').select('t.plan', 'plan').addSelect('COUNT(*)', 'count').groupBy('t.plan').getRawMany();
    const byType = await this.repo.createQueryBuilder('t').select('t.type', 'type').addSelect('COUNT(*)', 'count').groupBy('t.type').getRawMany();
    const byStatus = await this.repo.createQueryBuilder('t').select('t.status', 'status').addSelect('COUNT(*)', 'count').groupBy('t.status').getRawMany();
    const recent = await this.repo.find({ select: { id: true, name: true, type: true, plan: true, status: true, createdAt: true }, order: { createdAt: 'DESC' }, take: 10 });
    const planMap = Object.fromEntries(byPlan.map((r: any) => [r.plan, parseInt(r.count)]));
    return {
      success: true,
      stats: {
        total_tenants: total, active_tenants: active,
        by_plan: planMap,
        by_type: Object.fromEntries(byType.map((r: any) => [r.type, parseInt(r.count)])),
        by_status: Object.fromEntries(byStatus.map((r: any) => [r.status, parseInt(r.count)])),
      },
      recent_tenants: recent,
      tier_breakdown: {
        free: { count: planMap.free || 0, revenue: 0 },
        professional: { count: planMap.professional || 0, mrr: (planMap.professional || 0) * PLAN_TIERS.professional.price.monthly },
        enterprise: { count: planMap.enterprise || 0, mrr: (planMap.enterprise || 0) * PLAN_TIERS.enterprise.price.monthly },
      },
    };
  }

  async findOne(id: number) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const tier = PLAN_TIERS[tenant.plan];
    return {
      success: true,
      tenant: { ...tenant, tier: { id: tenant.plan, name: tier?.name, ...tier }, access_urls: { subdomain: tenant.subdomain ? `https://${tenant.subdomain}.mediqzy.com` : null, custom_domain: tenant.custom_domain ? `https://${tenant.custom_domain}` : null } },
    };
  }

  async create(dto: CreateTenantDto, createdBy: string) {
    const tier = PLAN_TIERS[dto.plan];
    const minPlan = MIN_PLAN[dto.type];
    if (minPlan && PLAN_RANK[dto.plan] < PLAN_RANK[minPlan]) throw new BadRequestException(`${dto.type} requires minimum ${minPlan} plan`);
    const slug = dto.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const subdomain = dto.subdomain || slug.substring(0, 63);
    const existing = await this.repo.createQueryBuilder('t').where('t.slug = :slug OR t.subdomain = :subdomain OR t.email = :email', { slug, subdomain, email: dto.email }).getOne();
    if (existing) {
      const conflict = existing.slug === slug ? 'slug' : existing.subdomain === subdomain ? 'subdomain' : 'email';
      throw new BadRequestException(`${conflict} already exists`);
    }
    const now = new Date();
    let plan_end_date: Date | undefined;
    if (dto.plan !== 'free') {
      const end = new Date(now);
      if (dto.billing_cycle === 'quarterly') end.setMonth(end.getMonth() + 3);
      else if (dto.billing_cycle === 'annual') end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);
      plan_end_date = end;
    }
    const hashed = dto.admin_password ? await bcrypt.hash(dto.admin_password, 10) : undefined;
    const tenant = this.repo.create({
      name: dto.name, slug, subdomain,
      custom_domain: tier.custom_domain ? dto.custom_domain : undefined,
      type: dto.type, email: dto.email, phone: dto.phone, website: dto.website,
      address: dto.address || {}, registration_number: dto.registration_number, tax_id: dto.tax_id,
      plan: dto.plan, billing_cycle: dto.billing_cycle || 'monthly',
      plan_start_date: now, plan_end_date,
      limits: tier.limits, features: tier.features,
      branding: dto.branding || {}, settings: dto.settings || {},
      admin_email: dto.admin_email, admin_password: hashed, status: 'active',
      metadata: { created_by: createdBy, created_at: now, creation_method: 'super_admin_dashboard' } as any,
    });
    const saved = await this.repo.save(tenant) as Tenant;
    return {
      success: true,
      message: `${dto.type} "${dto.name}" created successfully`,
      tenant: { id: saved.id, uid: saved.uid, name: saved.name, slug: saved.slug, type: saved.type, plan: saved.plan, status: saved.status },
      access: { subdomain_url: `https://${saved.subdomain}.mediqzy.com`, custom_domain_url: saved.custom_domain ? `https://${saved.custom_domain}` : null, admin_login: dto.admin_email || saved.admin_email },
    };
  }

  async update(id: number, dto: UpdateTenantDto, updatedBy: string) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const metadata = { ...tenant.metadata, last_updated_by: updatedBy, last_updated_at: new Date().toISOString() };
    await this.repo.update(id, { ...dto, metadata } as any);
    return { success: true, message: 'Tenant updated successfully' };
  }

  async suspend(id: number, reason: string, by: string) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const metadata = { ...tenant.metadata, suspension: { reason, suspended_by: by, suspended_at: new Date().toISOString() } };
    await this.repo.update(id, { status: 'suspended', metadata } as any);
    return { success: true, message: 'Tenant suspended', tenant: { id, name: tenant.name, status: 'suspended', reason } };
  }

  async reactivate(id: number, by: string) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status !== 'suspended') throw new BadRequestException(`Tenant is not suspended (current: ${tenant.status})`);
    const metadata = { ...tenant.metadata, reactivation: { reactivated_by: by, reactivated_at: new Date().toISOString() }, suspension: undefined };
    await this.repo.update(id, { status: 'active', metadata } as any);
    return { success: true, message: 'Tenant reactivated', tenant: { id, name: tenant.name, status: 'active' } };
  }

  async upgrade(id: number, plan: string, billing_cycle = 'monthly', by: string) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (PLAN_RANK[plan] <= PLAN_RANK[tenant.plan]) throw new BadRequestException(`Can only upgrade to a higher tier (current: ${tenant.plan})`);
    const tier = PLAN_TIERS[plan];
    const now = new Date();
    const end = new Date(now);
    if (billing_cycle === 'quarterly') end.setMonth(end.getMonth() + 3);
    else if (billing_cycle === 'annual') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    const metadata = { ...tenant.metadata, upgrade_history: [...(tenant.metadata?.upgrade_history || []), { from: tenant.plan, to: plan, date: now.toISOString(), by }] };
    await this.repo.update(id, { plan, billing_cycle, plan_start_date: now, plan_end_date: end, limits: tier.limits, features: tier.features, metadata } as any);
    return { success: true, message: `Upgraded from ${tenant.plan} to ${plan}`, new_plan: plan, plan_end_date: end };
  }

  async remove(id: number, hard: boolean, by: string) {
    const tenant = await this.repo.findOneBy({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (hard) { await this.repo.delete(id); return { success: true, message: 'Tenant permanently deleted', deleted_id: id }; }
    const metadata = { ...tenant.metadata, cancellation: { cancelled_by: by, cancelled_at: new Date().toISOString(), data_retention_until: new Date(Date.now() + 90 * 86400000).toISOString() } };
    await this.repo.update(id, { status: 'cancelled', metadata } as any);
    return { success: true, message: 'Tenant cancelled (data retained 90 days)', tenant: { id, status: 'cancelled' } };
  }

  getTiers() {
    return { success: true, tiers: Object.entries(PLAN_TIERS).map(([id, t]) => ({ id, ...t, recommended: id === 'professional' })) };
  }

  getEntityTypes() {
    return {
      success: true,
      entity_types: [
        { type: 'hospital', name: 'Hospital', min_plan: 'professional' },
        { type: 'clinic', name: 'Clinic', min_plan: 'free' },
        { type: 'lab', name: 'Diagnostic Lab', min_plan: 'free' },
        { type: 'pharmacy', name: 'Pharmacy', min_plan: 'free' },
        { type: 'ambulance', name: 'Ambulance Service', min_plan: 'professional' },
        { type: 'corporate', name: 'Corporate', min_plan: 'professional' },
        { type: 'tpa', name: 'TPA', min_plan: 'enterprise' },
        { type: 'psu', name: 'PSU', min_plan: 'enterprise' },
        { type: 'insurer', name: 'Insurance Company', min_plan: 'enterprise' },
        { type: 'broker', name: 'Insurance Broker', min_plan: 'professional' },
        { type: 'ngo', name: 'NGO', min_plan: 'free' },
        { type: 'homecare', name: 'Home Healthcare', min_plan: 'professional' },
      ],
    };
  }
}
