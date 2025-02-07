import {WebSocketSession} from "../WebSocketSession";
import {DatabaseManager} from "../../database/DatabaseManager";
import {column} from "../../database/column";
import {LoggedInMessageAction} from "../LoggedInMessageAction";
import {ConfirmResponseMessage} from "../../../../shared/messages/ConfirmResponseMessage";
import {Budget} from "../../database/dataClasses/Budget";
import {NeedsPayment} from "../../database/dataClasses/NeedsPayment";
import {SetAsPaidMessage} from "../../../../shared/messages/SetAsPaidMessage";
import {History} from "../../database/dataClasses/History";

// noinspection JSUnusedGlobalSymbols
export class SetAsPaidMessageAction extends LoggedInMessageAction<SetAsPaidMessage> {
	async authorizedExec(session: WebSocketSession, db: DatabaseManager): Promise<void> {
		const [data] = db.selectJoinedTable(
			NeedsPayment,
			["budgetId", "needsPaymentId", "amount"],
			[
				{
					joinedTable: Budget,
					select: ["budgetName"],
					on: `${column(NeedsPayment, "budgetId")} = ${column(Budget, "budgetId")}`,
				}
			],
			`${column(NeedsPayment, "userId")} = ${session.userId} AND ${column(NeedsPayment, "needsPaymentId")} = ${this.data.needsPaymentId}`,
			1,
		)
		const needsPaymentEntry = data.item
		const budget = data.joined["Budget"] as Budget
		
		if(!needsPaymentEntry) {
			session.send(new ConfirmResponseMessage(this.data, false))
			return
		}
		
		db.delete(NeedsPayment, `${column(NeedsPayment, "needsPaymentId")} = ${needsPaymentEntry.needsPaymentId}`)
		db.update(
			Budget, 
			{
				"+=": {
					lastPayment: Date.now(),
					spendingSum: needsPaymentEntry.amount,
					spendingTimes: 1
				}
			},
			`${column(Budget, "budgetId")} = ${needsPaymentEntry.budgetId}`
		)
		History.addHistory(db, session.userId!, "historySetAsPaid", [budget.budgetName], budget.budgetId)
		session.send(new ConfirmResponseMessage(this.data, true))
	}
}
