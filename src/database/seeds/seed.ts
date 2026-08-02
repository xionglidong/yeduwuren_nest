import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');

async function main(): Promise<void> {
  const dbPath = path.resolve(process.cwd(), 'database.db');
  console.log(`💾 Connecting to legacy SQLite database at: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.warn(`⚠️ SQLite file ${dbPath} not found. Skipping seed.`);
    return;
  }

  const legacyDb = new DatabaseSync(dbPath);

  const tableExists = (tableName: string): boolean => {
    const row = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    return !!row;
  };

  const getTableCols = (tableName: string): string[] => {
    const rows = legacyDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };

  // 1. Seed Student Points
  if (tableExists('studentPoints')) {
    console.log('🌱 Migrating Student Points from database.db...');
    const students = legacyDb.prepare('SELECT * FROM "studentPoints"').all() as Array<Record<string, any>>;
    for (const s of students) {
      const studentId = String(s.id || s._key);
      if (!studentId) continue;

      await prisma.student.upsert({
        where: { id: studentId },
        update: {
          name: s.name || `Student_${studentId}`,
          grade: s.grade || '未设置',
          points: typeof s.points === 'number' ? s.points : 0,
          learningPower: typeof s.learningPower === 'number' ? s.learningPower : 1.0,
          cohort: typeof s.cohort === 'number' ? s.cohort : null,
          lastUpdate: s.lastUpdate || null,
        },
        create: {
          id: studentId,
          name: s.name || `Student_${studentId}`,
          grade: s.grade || '未设置',
          points: typeof s.points === 'number' ? s.points : 0,
          learningPower: typeof s.learningPower === 'number' ? s.learningPower : 1.0,
          cohort: typeof s.cohort === 'number' ? s.cohort : null,
          lastUpdate: s.lastUpdate || null,
        },
      });
    }
  }

  // 2. Seed Paper Categories
  if (tableExists('paperCategories')) {
    console.log('🌱 Migrating Paper Categories from database.db...');
    const categories = legacyDb.prepare('SELECT * FROM "paperCategories"').all() as Array<Record<string, any>>;
    for (const cat of categories) {
      await prisma.paperCategory.upsert({
        where: { id: String(cat.id) },
        update: {
          name: String(cat.name || ''),
          paperIds: typeof cat.paperIds === 'string' ? cat.paperIds : JSON.stringify(cat.paperIds || []),
          createTime: String(cat.createTime || ''),
        },
        create: {
          id: String(cat.id),
          name: String(cat.name || ''),
          paperIds: typeof cat.paperIds === 'string' ? cat.paperIds : JSON.stringify(cat.paperIds || []),
          createTime: String(cat.createTime || ''),
        },
      });
    }
  }

  // 3. Seed Papers
  if (tableExists('gradePapers')) {
    console.log('🌱 Migrating Papers from database.db...');
    const papers = legacyDb.prepare('SELECT * FROM "gradePapers"').all() as Array<Record<string, any>>;
    for (const p of papers) {
      await prisma.paper.upsert({
        where: { id: String(p.id) },
        update: {
          grade: String(p.grade || ''),
          name: String(p.name || ''),
          questionCount: Number(p.questionCount || 0),
          singlePoints: Number(p.singlePoints || 0),
          totalPoints: Number(p.totalPoints || 0),
          answers: typeof p.answers === 'string' ? p.answers : JSON.stringify(p.answers || []),
          options: p.options ? (typeof p.options === 'string' ? p.options : JSON.stringify(p.options)) : null,
          createTime: String(p.createTime || ''),
          categoryId: p.categoryId ? String(p.categoryId) : null,
        },
        create: {
          id: String(p.id),
          grade: String(p.grade || ''),
          name: String(p.name || ''),
          questionCount: Number(p.questionCount || 0),
          singlePoints: Number(p.singlePoints || 0),
          totalPoints: Number(p.totalPoints || 0),
          answers: typeof p.answers === 'string' ? p.answers : JSON.stringify(p.answers || []),
          options: p.options ? (typeof p.options === 'string' ? p.options : JSON.stringify(p.options)) : null,
          createTime: String(p.createTime || ''),
          categoryId: p.categoryId ? String(p.categoryId) : null,
        },
      });
    }
  }

  // 4. Seed Student Submissions / Answers
  if (tableExists('studentAnswers')) {
    console.log('🌱 Migrating Student Answers from database.db...');
    const answers = legacyDb.prepare('SELECT * FROM "studentAnswers"').all() as Array<Record<string, any>>;
    for (const a of answers) {
      if (a.studentId) {
        await prisma.student.upsert({
          where: { id: String(a.studentId) },
          update: { name: a.studentName || `Student_${a.studentId}` },
          create: {
            id: String(a.studentId),
            name: a.studentName || `Student_${a.studentId}`,
            grade: '未设置',
          },
        });
      }

      const paper = a.paperId ? await prisma.paper.findUnique({ where: { id: String(a.paperId) } }) : null;
      if (paper && a.studentId) {
        const existing = await prisma.studentAnswer.findFirst({
          where: {
            paperId: String(a.paperId),
            studentId: String(a.studentId),
            submitTime: String(a.submitTime || ''),
          },
        });

        if (!existing) {
          await prisma.studentAnswer.create({
            data: {
              paperId: String(a.paperId),
              studentId: String(a.studentId),
              studentName: String(a.studentName || ''),
              answers: typeof a.answers === 'string' ? a.answers : JSON.stringify(a.answers || []),
              score: Number(a.score || 0),
              totalPoints: Number(a.totalPoints || paper.totalPoints || 100),
              submitTime: String(a.submitTime || new Date().toISOString()),
              timeElapsed: a.timeElapsed ? Number(a.timeElapsed) : null,
              isFirstSubmission: Boolean(a.isFirstSubmission !== 0),
            },
          });
        }
      }
    }
  }

  // 5. Seed Timer Records
  if (tableExists('timerRecords')) {
    console.log('🌱 Migrating Timer Records from database.db...');
    const cols = getTableCols('timerRecords');
    const records = legacyDb.prepare('SELECT * FROM "timerRecords"').all() as Array<Record<string, any>>;

    for (const row of records) {
      const studentId = String(row._key);
      if (!studentId) continue;

      for (const col of cols) {
        if (col === '_key' || col === '_rowid') continue;
        const val = row[col];
        if (val !== null && val !== undefined) {
          const paperId = col;
          const recordJson = typeof val === 'string' ? val : JSON.stringify(val);

          await prisma.timerRecord.upsert({
            where: {
              studentId_paperId: {
                studentId,
                paperId,
              },
            },
            update: { recordData: recordJson },
            create: { studentId, paperId, recordData: recordJson },
          });
        }
      }
    }
  }

  // 6. Seed Self Learning Watch Stats
  if (tableExists('selfLearningWatchStats')) {
    console.log('🌱 Migrating Self Learning Watch Stats from database.db...');
    const cols = getTableCols('selfLearningWatchStats');
    const records = legacyDb.prepare('SELECT * FROM "selfLearningWatchStats"').all() as Array<Record<string, any>>;

    for (const row of records) {
      const resourceKey = String(row._key);
      if (!resourceKey) continue;

      for (const col of cols) {
        if (col === '_key' || col === '_rowid') continue;
        const val = row[col];
        if (val !== null && val !== undefined) {
          const studentId = col;
          let watchDuration = 0;
          if (typeof val === 'number') watchDuration = val;
          else if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val);
              watchDuration = typeof parsed === 'number' ? parsed : parseInt(val, 10) || 0;
            } catch {
              watchDuration = parseInt(val, 10) || 0;
            }
          }

          await prisma.selfLearningWatchStat.upsert({
            where: {
              resourceKey_studentId: {
                resourceKey,
                studentId,
              },
            },
            update: { watchDuration },
            create: { resourceKey, studentId, watchDuration },
          });
        }
      }
    }
  }

  // 7. Seed Exchange Prizes
  if (tableExists('exchangePrizes')) {
    console.log('🌱 Migrating Exchange Prizes from database.db...');
    const prizes = legacyDb.prepare('SELECT * FROM "exchangePrizes"').all() as Array<Record<string, any>>;
    for (const p of prizes) {
      await prisma.exchangePrize.upsert({
        where: { id: String(p.id) },
        update: {
          name: String(p.name || ''),
          points: Number(p.points || 0),
          description: p.description ? String(p.description) : null,
          icon: p.icon ? String(p.icon) : null,
          iconColor: p.iconColor ? String(p.iconColor) : null,
          bgColor: p.bgColor ? String(p.bgColor) : null,
        },
        create: {
          id: String(p.id),
          name: String(p.name || ''),
          points: Number(p.points || 0),
          description: p.description ? String(p.description) : null,
          icon: p.icon ? String(p.icon) : null,
          iconColor: p.iconColor ? String(p.iconColor) : null,
          bgColor: p.bgColor ? String(p.bgColor) : null,
        },
      });
    }
  }

  // 8. Seed Exchange Records
  if (tableExists('exchangeRecords')) {
    console.log('🌱 Migrating Exchange Records from database.db...');
    const records = legacyDb.prepare('SELECT * FROM "exchangeRecords"').all() as Array<Record<string, any>>;
    for (const rec of records) {
      if (rec.studentId) {
        await prisma.student.upsert({
          where: { id: String(rec.studentId) },
          update: {},
          create: {
            id: String(rec.studentId),
            name: rec.studentName || `Student_${rec.studentId}`,
            grade: '未设置',
          },
        });

        const recordId = rec.id ? String(rec.id) : undefined;
        if (recordId) {
          await prisma.exchangeRecord.upsert({
            where: { id: recordId },
            update: {
              studentId: String(rec.studentId),
              studentName: String(rec.studentName || ''),
              prizeName: String(rec.prizeName || ''),
              points: Number(rec.points || 0),
              time: String(rec.time || new Date().toLocaleString()),
            },
            create: {
              id: recordId,
              studentId: String(rec.studentId),
              studentName: String(rec.studentName || ''),
              prizeName: String(rec.prizeName || ''),
              points: Number(rec.points || 0),
              time: String(rec.time || new Date().toLocaleString()),
            },
          });
        }
      }
    }
  }

  // 9. Seed Forum Posts (using upsert for idempotency)
  if (tableExists('publicForumMessages')) {
    console.log('🌱 Migrating Forum Posts from database.db...');
    const posts = legacyDb.prepare('SELECT * FROM "publicForumMessages"').all() as Array<Record<string, any>>;
    for (const post of posts) {
      if (post.senderId) {
        await prisma.student.upsert({
          where: { id: String(post.senderId) },
          update: {},
          create: {
            id: String(post.senderId),
            name: post.senderName || `Student_${post.senderId}`,
            grade: '未设置',
          },
        });

        const postId = String(post.id);
        await prisma.forumPost.upsert({
          where: { id: postId },
          update: {
            senderId: String(post.senderId),
            senderName: String(post.senderName || ''),
            isAnonymous: Boolean(post.isAnonymous),
            text: String(post.text || ''),
            image: post.image ? String(post.image) : null,
            time: String(post.time || new Date().toLocaleString()),
            likedBy: typeof post.likedBy === 'string' ? post.likedBy : JSON.stringify(post.likedBy || []),
            tippedPoints: Number(post.tippedPoints || 0),
          },
          create: {
            id: postId,
            senderId: String(post.senderId),
            senderName: String(post.senderName || ''),
            isAnonymous: Boolean(post.isAnonymous),
            text: String(post.text || ''),
            image: post.image ? String(post.image) : null,
            time: String(post.time || new Date().toLocaleString()),
            likedBy: typeof post.likedBy === 'string' ? post.likedBy : JSON.stringify(post.likedBy || []),
            tippedPoints: Number(post.tippedPoints || 0),
          },
        });
      }
    }
  }

  // 10. Seed Forum Resource Materials
  if (tableExists('forumResourceMaterials')) {
    console.log('🌱 Migrating Forum Resource Materials from database.db...');
    const materials = legacyDb.prepare('SELECT * FROM "forumResourceMaterials"').all() as Array<Record<string, any>>;
    for (const mat of materials) {
      const matId = String(mat.id);
      await prisma.forumResourceMaterial.upsert({
        where: { id: matId },
        update: {
          title: String(mat.title || ''),
          file: String(mat.file || ''),
          createTime: String(mat.createTime || ''),
        },
        create: {
          id: matId,
          title: String(mat.title || ''),
          file: String(mat.file || ''),
          createTime: String(mat.createTime || ''),
        },
      });
    }
  }

  // 11. Seed Meta Config
  if (tableExists('_meta')) {
    console.log('🌱 Migrating Meta Config from database.db...');
    const metas = legacyDb.prepare('SELECT * FROM "_meta"').all() as Array<Record<string, any>>;
    for (const meta of metas) {
      await prisma.metaConfig.upsert({
        where: { key: String(meta.key) },
        update: { value: String(meta.value || '') },
        create: { key: String(meta.key), value: String(meta.value || '') },
      });
    }
  }

  console.log('🎉 Migration from database.db into Prisma database completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
