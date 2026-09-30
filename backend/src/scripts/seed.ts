/**
 * Dev seed: one developer account, one approved shelter, one user - all inside
 * the San Jose Del Monte service area.
 */
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { DeveloperAccount } from '../models/DeveloperAccount';
import { Shelter } from '../models/Shelter';
import { User } from '../models/User';
import { SJDM_CENTER } from '../config/serviceArea';
import { logger } from '../utils/logger';

async function seed() {
  // The demo accounts share a published password, so they must never reach a real database.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo accounts in production. Use `npm run create-admin` instead.');
  }
  await connectDatabase();
  const pass = await bcrypt.hash('saanpaw123', 10);
  const center: [number, number] = [SJDM_CENTER.longitude, SJDM_CENTER.latitude];

  await Promise.all([
    DeveloperAccount.deleteMany({ email: { $in: ['dev@saanpaw.ph', 'dev@saanpaw.local'] } }),
    Shelter.deleteMany({ email: 'shelter@saanpaw.ph' }),
    User.deleteMany({ email: 'user@saanpaw.ph' }),
  ]);

  // Developer account
  await DeveloperAccount.create({
    email: 'dev@saanpaw.ph',
    passwordHash: pass,
    role: 'developer',
  });

  // Shelter account
  await Shelter.create({
    name: 'SJDM City Animal Care Center',
    barangay: 'Poblacion',
    contactNumber: '(044) 815 1234',
    email: 'shelter@saanpaw.ph',
    street: 'City Hall Compound',
    subdivision: 'Poblacion, San Jose Del Monte',
    location: { type: 'Point', coordinates: center },
    operatingRadiusMeters: 5000,
    permitNumber: 'SJDM-VET-2024-001',
    capacity: 60,
    currentOccupancy: 0,
    logoColor: '#2E7D5B',
    approvalStatus: 'approved',
    adminEmail: 'shelter@saanpaw.ph',
    adminPasswordHash: pass,
  });

  // User account
  await User.create({
    firstName: 'Test',
    lastName: 'User',
    email: 'user@saanpaw.ph',
    phone: '0917 555 0142',
    passwordHash: pass,
    barangay: 'Poblacion',
    alertRadiusMeters: 3000,
    homeLocation: { type: 'Point', coordinates: center },
    flaggedReportCount: 0,
    isBanned: false,
  });

  logger.info('✓ Seed complete!');
  logger.info('Demo accounts:');
  logger.info('  Developer: dev@saanpaw.ph / saanpaw123');
  logger.info('  Shelter:   shelter@saanpaw.ph / saanpaw123');
  logger.info('  User:      user@saanpaw.ph / saanpaw123');
  await disconnectDatabase();
}

seed().catch((e) => {
  logger.error(e);
  process.exit(1);
});
