import { MongoClient } from 'mongodb';
import { env } from '$env/dynamic/private';

const client = new MongoClient(env.MONGO_URL ?? 'mongodb://localhost:27017/champ_hr');
const clientPromise = client.connect();

export async function getMongo() {
	const c = await clientPromise;
	return c.db();
}

export interface ActivityLogEntry {
	actorUserId: string;
	action: string;
	targetType: string;
	targetId?: string;
	details?: Record<string, unknown>;
	createdAt: Date;
}

export async function logActivity(entry: Omit<ActivityLogEntry, 'createdAt'>) {
	const db = await getMongo();
	await db.collection<ActivityLogEntry>('activity_log').insertOne({
		...entry,
		createdAt: new Date()
	});
}

// --- Policy documents (PRD §6.2: Mongo is system of record for versioned/rich-content
// policy uploads; Postgres holds the structured rows extracted from them) ---

export type PolicyDocumentKind = 'holiday_calendar' | 'leave_policy';

export interface PolicyDocumentEntry {
	kind: PolicyDocumentKind;
	filename: string;
	mimeType: string;
	fileBase64: string;
	uploadedBy: string;
	extractedJson?: unknown;
	extractionModel?: string;
	status: 'uploaded' | 'extracted' | 'extraction_failed' | 'published';
	createdAt: Date;
	publishedAt?: Date;
}

export async function insertPolicyDocument(
	entry: Omit<PolicyDocumentEntry, 'createdAt'>
): Promise<string> {
	const db = await getMongo();
	const result = await db.collection<PolicyDocumentEntry>('policy_documents').insertOne({
		...entry,
		createdAt: new Date()
	});
	return result.insertedId.toString();
}

export async function updatePolicyDocument(
	id: string,
	update: Partial<Pick<PolicyDocumentEntry, 'extractedJson' | 'extractionModel' | 'status' | 'publishedAt'>>
) {
	const { ObjectId } = await import('mongodb');
	const db = await getMongo();
	await db
		.collection<PolicyDocumentEntry>('policy_documents')
		.updateOne({ _id: new ObjectId(id) } as never, { $set: update });
}

export async function getPolicyDocument(id: string) {
	const { ObjectId } = await import('mongodb');
	const db = await getMongo();
	return db.collection<PolicyDocumentEntry>('policy_documents').findOne({ _id: new ObjectId(id) } as never);
}
