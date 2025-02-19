import {BasePublicTable} from "../../../../shared/BasePublicTable";
import {LoggedInMessageAction} from "../LoggedInMessageAction";
import {BaseListMessage} from "../../../../shared/BaseListMessage";
import {FaultyListException} from "../../exceptions/FaultyListException";
import {Class} from "../../../../shared/Class";
import {TableSettings} from "../../database/TableSettings";
import {FaultyInputException} from "../../exceptions/FaultyInputException";
import {BackendTable} from "../../database/DatabaseInstructions";

interface ListValues {
	tableClass: Class<BackendTable>
	publicObj: BasePublicTable
	settings: TableSettings<BackendTable>
}

export abstract class BaseListMessageAction<T extends BaseListMessage> extends LoggedInMessageAction<T> {
	protected async getValues(): Promise<ListValues> {
		const publicTableClass = await this.getPublicTableClassFromMessage(this.data)
		const publicObj = new publicTableClass
		const tableClass = await this.getTableClass(this.data.listName)
		const obj = new tableClass
		
		const settings = obj.getSettings() as TableSettings<BackendTable>
		
		return {
			tableClass: tableClass,
			publicObj: publicObj,
			settings: settings
		}
	}
	
	protected checkValues(values: Partial<BasePublicTable>, publicObj: BasePublicTable, settings: TableSettings<BackendTable>): void {
		const primaryKey = settings.primaryKey
		if(Object.prototype.hasOwnProperty.call(publicObj, primaryKey))
			delete values[primaryKey as keyof BasePublicTable]
		for(const key in values) {
			if(!Object.prototype.hasOwnProperty.call(publicObj, key))
				throw new FaultyInputException()
		}
	}
	
	private async getPublicTableClassFromMessage(data: BaseListMessage): Promise<Class<BasePublicTable>> {
		if(!this.stringIsSafe(data.listName))
			throw new FaultyListException()
		return this.getPublicTableClass(data.listName)
	}
	
	private async getPublicTableClass(tableName: string): Promise<Class<BasePublicTable>> {
		const className = `Pub${tableName}`
		const tableClass = await require(`../../../../shared/public/${className}`);
		if(!tableClass)
			throw new FaultyListException()
		
		const c = tableClass[className] as Class<BasePublicTable>
		if(!c)
			throw new FaultyListException()
		return c
	}
	
	private async getTableClass(tableName: string): Promise<Class<BackendTable>> {
		const tableClass = await require(`../../database/dataClasses/${tableName}`);
		if(!tableClass)
			throw new FaultyListException()
		
		const c = tableClass[tableName] as Class<BackendTable>
		if(!c)
			throw new FaultyListException()
		return c
	}
}
