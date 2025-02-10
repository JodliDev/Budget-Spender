import {ListMessage} from "../../../../shared/messages/ListMessage";
import {WebSocketSession} from "../WebSocketSession";
import {DatabaseManager} from "../../database/DatabaseManager";
import {ListResponseMessage} from "../../../../shared/messages/ListResponseMessage";
import {FaultyInputException} from "../../exceptions/FaultyInputException";
import {SqlWhereFromFilter} from "../../database/SqlWhere";
import {BaseListMessageAction} from "./BaseListMessageAction";
import {column} from "../../database/column";
import {BasePublicTable} from "../../../../shared/BasePublicTable";

// noinspection JSUnusedGlobalSymbols
export class ListMessageAction extends BaseListMessageAction<ListMessage> {
	async authorizedExec(session: WebSocketSession, db: DatabaseManager): Promise<void> {
		const values = await this.getValues()
		
		let order: string | undefined = undefined
		if(this.data.order) {
			const table = values.settings.getAllowedColumnTable(this.data.order)
			if(!table)
				throw new FaultyInputException()
			else
				order = column(table, this.data.order as keyof BasePublicTable)
				
		}
		
		if((this.data.orderType && this.data.orderType != "ASC" && this.data.orderType != "DESC")
			|| !this.isType(this.data.from, "number")
			|| !this.isType(this.data.limit, "number")
		)
			throw new FaultyInputException()
		
		const joinedResponse = await db.selectFullyJoinedPublicTable(
			values.tableClass,
			values.publicObj.getColumnNames(),
			values.settings,
			values.settings?.getWhere(session, this.data.filter ? SqlWhereFromFilter(values.tableClass, values.settings, this.data.filter) : undefined),
			this.data.limit,
			this.data.from,
			order,
			this.data.orderType
		)
		
		session.send(new ListResponseMessage(
			this.data, 
			true,
			joinedResponse,
			values.publicObj.getPrimaryKey().toString(),
			db.getCount(values.tableClass, values.settings.getWhere(session))
		))
	}
}
