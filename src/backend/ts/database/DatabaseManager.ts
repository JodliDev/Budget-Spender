import {SqlQueryGenerator} from "./SqlQueryGenerator";
import BetterSqlite3 from "better-sqlite3";
import {DatabaseInstructions} from "./DatabaseInstructions";
import {Class} from "../../../shared/Class";
import {Options} from "../Options";
import {DatabaseMigrationManager} from "./DatabaseMigrationManager";
import {BasePublicTable} from "../../../shared/BasePublicTable";
import {column} from "./column";
import {ListResponseEntry} from "../../../shared/messages/ListResponseMessage";
import {ListMessageAction} from "../network/messageActions/ListMessageAction";
import {TableSettings} from "./TableSettings";


const DB_NAME = "db.sqlite"

export interface JoinedData<JoinedT extends BasePublicTable> {
	joinedTable: Class<JoinedT>,
	on: string,
	select: (keyof JoinedT)[]
}
type MapToJoinedDataArray<JoinedT extends BasePublicTable[]> = { [K in keyof JoinedT]: JoinedData<JoinedT[K]> };

export interface JoinedResponseEntry<T extends BasePublicTable> extends ListResponseEntry<Partial<T>>{
	entry: Partial<T>,
	joined: Record<string, unknown>
}


export class DatabaseManager {
	private readonly db: BetterSqlite3.Database
	
	
	public static async access(dbInstructions: DatabaseInstructions, options: Options): Promise<DatabaseManager> {
		const manager = new DatabaseManager(options)
		const db = manager.db
		const version = db.pragma("user_version", { simple: true }) as number
		
		if(dbInstructions.version != version) {
			const date = new Date()
			const backupPath = `${options.sqlite}${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getTime()}.sqlite`
			await db.backup(backupPath)
			const backupDb = new BetterSqlite3(`${backupPath}`)
			
			const migrationManager = new DatabaseMigrationManager(db, backupDb)
			migrationManager.migrateTable(version, dbInstructions)
		}
		
		return manager
	}
	
	private constructor(options: Options) {
		const path = options.sqlite
		console.log(`Loading Database ${path}${DB_NAME}`)
		this.db = new BetterSqlite3(`${path}${DB_NAME}`)
		
	}
	
	private correctValues<T extends BasePublicTable>(
		table: Class<T>,
		values: Partial<T>[],
		newBoolean: (value: unknown) => any
	): Partial<T>[] {
		if(!values.length)
			return values
		
		const obj = new table
		const keys = values[0]
		for(const key in keys) {
			switch(typeof obj[key]) {
				case "boolean":
					values.forEach(entry => entry[key] = newBoolean(entry[key]))
			}
		}
		return values
	}
	public typesToJs<T extends BasePublicTable>(table: Class<T>, values: Partial<T>[]): Partial<T>[] {
		return this.correctValues(table, values, value => !!value)
	}
	public typesToSql<T extends BasePublicTable>(table: Class<T>, values: Partial<T>[]): Partial<T>[] {
		return this.correctValues(table, values, value => SqlQueryGenerator.booleanToSqlValue(value))
	}
	
	public tableSelect<T extends BasePublicTable>(table: Class<T>, where?: string, limit?: number, from?: number): T[] {
		return this.typesToJs(table, this.unsafeSelect(BasePublicTable.getName(table), undefined, where, limit, from) as Partial<T>[]) as T[]
	}
	
	
	public async joinedSelectForPublicTable<T extends BasePublicTable>(
		table: Class<T>,
		select: (keyof BasePublicTable)[],
		settings?: TableSettings<T>,
		where?: string,
		limit?: number,
		from?: number
	): Promise<ListResponseEntry<T>[]> {
		const joinArray = settings ? await ListMessageAction.getJoinArray(table, settings) : []
		return this.joinedSelect(table, select, joinArray, where, limit, from) as ListResponseEntry<T>[]
	}
	
	public joinedSelect<T extends BasePublicTable, JoinedT extends BasePublicTable[]>(
		table: Class<T>,
		select: (keyof T)[],
		joinArray: MapToJoinedDataArray<JoinedT>,
		where?: string,
		limit?: number,
		from?: number
	): JoinedResponseEntry<T>[] {
		let selectWithTable = select.map(entry => column(table, entry))
		const joinSqlArray = []
		for(const join of joinArray) {
			selectWithTable = selectWithTable.concat(join.select.map(entry => column(join.joinedTable, entry)))
			joinSqlArray.push({ joinedTableName: BasePublicTable.getName(join.joinedTable), on: join.on })
		}
		
		const lines = this.unsafeSelect(
			BasePublicTable.getName(table),
			selectWithTable,
			where,
			limit,
			from,
			joinSqlArray
		) as Record<string, unknown>[]
		
		//sort data into response object:
		const response: JoinedResponseEntry<T>[] = []
		for(const line of lines) {
			const entry: Partial<T> = {}
			const joinedResult: Record<string, unknown> = {}
			
			for(const selectEntry of select) {
				entry[selectEntry] = line[selectEntry.toString()] as any
			}
			
			for(const join of joinArray) {
				const joined: Partial<BasePublicTable> = {}
				for(const selectEntry of join.select) {
					joined[selectEntry] = line[selectEntry.toString()] as any
				}
				joinedResult[BasePublicTable.getName(join.joinedTable)] = joined
			}
            response.push({entry: entry, joined: joinedResult})
		}
		return response
	}
	
	private unsafeSelect(
		tableName: string,
		select?: string[],
		where?: string,
		limit?: number,
		from?: number,
		join?: { joinedTableName: string, on: string }[]
	) {
		const query = SqlQueryGenerator.createSelectSql(tableName, select, where, limit, from, join)
		console.log(query)
		const statement = this.db.prepare(query)
		return statement.all()
	}
	
	public getCount(tableName: string, where?: string): number {
		const query = SqlQueryGenerator.createSelectSql(tableName, ["COUNT(*)"], where)
		const statement = this.db.prepare(query)
		const result = statement.get() as Record<string, number>
		return result["COUNT(*)"]
	}
	
	public insert<T extends BasePublicTable>(table: Class<T>, values: Partial<T>): number | bigint {
		return this.unsafeInsert(BasePublicTable.getName(table), this.typesToSql(table, [values])[0])
	}
	private unsafeInsert<T extends BasePublicTable>(tableName: string, values: Partial<T>): number | bigint {
		const query = SqlQueryGenerator.createInsertSql(tableName, values)
		const sqlValues = Object.values(values)
		
		const statement = this.db.prepare(query)
		const result = statement.run(Object.values(sqlValues))
		
		return result.changes > 0 ? result.lastInsertRowid : 0
	}
	
	public update<T extends BasePublicTable>(table: Class<T>, values: Partial<T>, where: string, limit?: number) {
		return this.unsafeUpdate(BasePublicTable.getName(table), this.typesToSql(table, [values])[0], where, limit)
	}
	private unsafeUpdate<T extends BasePublicTable>(tableName: string, values: Partial<T>, where: string, limit?: number) {
		const query = SqlQueryGenerator.createUpdateSql(tableName, values, where, limit)
		
		const sqlValues: unknown[] = []
		for(let key in values) {
			sqlValues.push(values[key])
		}
		
		const statement = this.db.prepare(query)
		return statement.run(Object.values(sqlValues)).changes
	}
	
	public delete<T extends BasePublicTable>(table: Class<T>, where: string, limit?: number) {
		return this.unsafeDelete(BasePublicTable.getName(table), where, limit)
	}
	private unsafeDelete(tableName: string, where: string, limit?: number) {
		const query = SqlQueryGenerator.createDeleteSql(tableName, where, limit)
		
		const statement = this.db.prepare(query)
		return statement.run().changes
	}
}
