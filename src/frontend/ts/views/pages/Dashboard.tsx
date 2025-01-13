import m, { Vnode } from "mithril";
import {ListWidget, ListWidgetCallback} from "../../widgets/ListWidget";
import {Lang} from "../../../../shared/Lang";
import {PubWaitingEntry} from "../../../../shared/public/PubWaitingEntry";
import {PubPossibleSpendingEntry} from "../../../../shared/public/PubPossibleSpendingEntry";
import {BtnWidget} from "../../widgets/BtnWidget";
import {PubNeedsSpendingEntry} from "../../../../shared/public/PubNeedsSpendingEntry";
import {ChooseForSpendingMessage} from "../../../../shared/messages/ChooseForSpendingMessage";
import {ListMessage} from "../../../../shared/messages/ListMessage";
import {ListResponseMessage} from "../../../../shared/messages/ListResponseMessage";
import {SetAsPaidMessage} from "../../../../shared/messages/SetAsPaidMessage";
import {DropdownOptions, MouseOverDropdownMenu} from "../../widgets/DropdownMenu";
import {ConfirmResponseMessage} from "../../../../shared/messages/ConfirmResponseMessage";
import "./dashboard.css"
import {PubUser} from "../../../../shared/public/PubUser";
import {LoggedInBasePage} from "../LoggedInBasePage";
import {AddToWaitingMessage} from "../../../../shared/messages/AddToWaitingMessage";
import {DeleteMessage} from "../../../../shared/messages/DeleteMessage";

interface NeedsSpendingEntryInformation {
	possibleSpendingEntry: PubPossibleSpendingEntry
	needsSpendingEntry: PubNeedsSpendingEntry
}

export class Dashboard extends LoggedInBasePage {
	private needsSpendingEntries: NeedsSpendingEntryInformation[] = []
	private waitingListCallback: ListWidgetCallback = new ListWidgetCallback()
	private dropdownOptions: DropdownOptions = {
		manualPositioning: true,
		disableMenuPointerEvents: true
	}
	private user = new PubUser()
	
	
	private positionPossibleSpendingInfo(event: MouseEvent) {
		this.dropdownOptions.updatePositionCallback && this.dropdownOptions.updatePositionCallback(event.clientX, event.clientY)
	}
	private possibleSpendingLineView(entry: PubPossibleSpendingEntry, addedAt?: number): Vnode {
		return <div class="horizontal fillSpace possibleSpendingEntry">
			{ !addedAt &&
				BtnWidget.PopoverBtn("arrowCircleLeft", Lang.get("manuallyAddToWaitingList"), this.addToWaitList.bind(this, entry)) }
			
			{ entry.homepage.length != 0
				? <a href={ entry.homepage } target="_blank">
					{ BtnWidget.PopoverBtn("home", Lang.get("homepage")) }
				</a>
				: BtnWidget.Empty()
			}
			{ entry.spendingUrl.length != 0
				? <a href={ entry.spendingUrl } target="_blank">
					{ BtnWidget.PopoverBtn("donate", Lang.get("spendingUrl")) }
				</a>
				: BtnWidget.Empty()
			}
			<div class="fillSpace">
				{
					this.possibleSpendingDropdown(
						<span>{ entry.spendingName }</span>,
						entry,
						addedAt
					)
				}
			</div>
		</div>
	}
	private possibleSpendingDropdown(clickElement: Vnode, entry: PubPossibleSpendingEntry, addedAt?: number): Vnode<any, unknown> {
		return MouseOverDropdownMenu(
			"possibleSpendingEntry",
			<div onmousemove={this.positionPossibleSpendingInfo.bind(this)} class="possibleSpendingDropdownClicker">
				{ clickElement }
			</div>,
			() => <div class="surface vertical possibleSpendingDropdownContent">
				<h3 class="textCentered">{ entry.spendingName }</h3>
				<div class="subSurface labelLike">
					<small>{Lang.get("spendingCount")}</small>
					<span>{entry.spendingTimes}</span>
				</div>
				<div class="subSurface labelLike">
					<small>{Lang.get("totalSpending")}</small>
					<span>{entry.spendingSum}{this.user.currency}</span>
				</div>
				<div class="subSurface labelLike">
					<small>{Lang.get("lastSpending")}</small>
					<span>{entry.lastSpending ? (new Date(entry.lastSpending)).toLocaleDateString() : Lang.get("nextUp")}</span>
				</div>
				{ !!addedAt &&
					<div class="subSurface labelLike">
						<small>{Lang.get("addedAt")}</small>
						<span>{(new Date(addedAt)).toLocaleDateString()}</span>
					</div>
				}
			</div>,
			this.dropdownOptions
		)
	}
	
	private async addToWaitList(entry: PubPossibleSpendingEntry): Promise<void> {
		const response = await this.site.socket.sendAndReceive(new AddToWaitingMessage(entry))
		if(!response.success) {
			this.site.errorManager.error(Lang.get("errorUnknown"))
			return
		}
		
		await this.waitingListCallback.reload()
	}
	
	private async chooseForSpending(): Promise<void> {
		const amount = prompt(Lang.get("promptSpendingAmount"), "1")
		if(!amount || Number.isNaN(amount))
			return
		const response = await this.site.socket.sendAndReceive(new ChooseForSpendingMessage(parseFloat(amount)))
		if(!response.success) {
			this.site.errorManager.error(Lang.get("errorUnknown"))
			return
		}
		await this.loadNeededSpending()
		await this.waitingListCallback.reload()
	}
	
	private async removeFromSpending(entry: PubNeedsSpendingEntry): Promise<void> {
		if(!confirm(Lang.get("confirmDelete")))
			return
		const response = await this.site.socket.sendAndReceive(new DeleteMessage(PubNeedsSpendingEntry, entry.needsSpendingEntryId))
		if(!response.success)
			this.site.errorManager.error(Lang.get("errorUnknown"))
		
		await this.loadNeededSpending()
	}
	
	private async loadNeededSpending(): Promise<void> {
		const response = await this.site.socket.sendAndReceive(new ListMessage(PubNeedsSpendingEntry, 0, 100)) as ListResponseMessage<PubNeedsSpendingEntry>
		if(response.success)
			this.needsSpendingEntries = response.list.map(entry => {
				return {
					possibleSpendingEntry: entry.joined["PossibleSpendingEntry"] as PubPossibleSpendingEntry,
					needsSpendingEntry: entry.item
				}
			})
	}
	
	private async setAsPaid(info: NeedsSpendingEntryInformation) {
		const response = await this.site.socket.sendAndReceive(new SetAsPaidMessage(info.needsSpendingEntry)) as ConfirmResponseMessage
		if(response.success) {
			await this.loadNeededSpending()
			await this.waitingListCallback.reload()
		}
		else
			this.site.errorManager.error(Lang.get("errorUnknown"))
	}
	
	async load(): Promise<void> {
		await super.load()
		await this.loadNeededSpending()
		
		const response = await this.site.socket.sendAndReceive(
			new ListMessage(PubUser, 0, 1)
		) as ListResponseMessage<PubUser>
		
		if(response.success && response.list.length != 0)
			this.user = response.list[0].item
	}
	
	getView(): Vnode {
		return <div class="vertical">
			<div class="horizontal vAlignStretched hAlignCenter wrapContent needsSpendingBox">
				{ this.needsSpendingEntries.map(info => 
					<div class="vertical surface needsSpendingEntry hAlignStretched">
						<div class="subSurface textCentered spendingHeader">{info.needsSpendingEntry.amount}{this.user?.currency}</div>
						{
							this.possibleSpendingDropdown(
								<div class="textCentered">{info.possibleSpendingEntry.spendingName}</div>,
								info.possibleSpendingEntry,
								info.needsSpendingEntry.addedAt
							)
						}
						<div class="fillSpace"></div>
						<div class="horizontal subSurface">
							{ info.possibleSpendingEntry.homepage.length != 0 &&
								<a href={ info.possibleSpendingEntry.homepage } target="_blank">
									{ BtnWidget.PopoverBtn("home", Lang.get("homepage")) }
								</a>
							}
							{ info.possibleSpendingEntry.spendingUrl.length != 0 &&
								<a href={ info.possibleSpendingEntry.spendingUrl } target="_blank">
									{ BtnWidget.PopoverBtn("donate", Lang.get("spendingUrl")) }
								</a>
							}
							<div class="fillSpace"></div>
							{
								BtnWidget.PopoverBtn("checkCircle", Lang.get("setAsPaid"), this.setAsPaid.bind(this, info))
							}
						</div>
						{ BtnWidget.DefaultBtn("remove", this.removeFromSpending.bind(this, info.needsSpendingEntry) ) }
					</div>
				)}
			</div>
			<div class="horizontal hAlignCenter wrapContent">
				{
					ListWidget({
						title: Lang.get("nextUp"),
						tableClass: PubWaitingEntry,
						site: this.site,
						hideRefresh: true,
						deleteOptions: { onDeleted: () => this.waitingListCallback.reload() },
						customOptions: this.waitingListCallback.isEmpty() ? undefined :
							BtnWidget.PopoverBtn("luck", Lang.get("selectRandomSpendingNow"), this.chooseForSpending.bind(this)),
						callback: this.waitingListCallback,
						getEntryView: entry =>
							this.possibleSpendingLineView(entry.joined.PossibleSpendingEntry as PubPossibleSpendingEntry, entry.item.addedAt)
					})
				}
				
				{
					ListWidget<PubPossibleSpendingEntry>({
						title: Lang.get("allEntries"),
						tableClass: PubPossibleSpendingEntry,
						site: this.site,
						hideRefresh: true,
						addOptions: {
							columns: ["spendingName", "homepage", "spendingUrl"],
							onAdded: async () => {
								this.waitingListCallback.reload && await this.waitingListCallback.reload()
							},
							getValueError: (key, value) => {
								switch(key) {
									case "spendingName":
										return (value as string).length < PubPossibleSpendingEntry.SPENDING_NAME_MIN_LENGTH ? Lang.get("errorTooShort") : undefined
								}
							}
						},
						editOptions: {
							columns: ["spendingName", "homepage", "spendingUrl", "enabled"],
							onChanged: async () => {
								await this.waitingListCallback.reload()
								await this.loadNeededSpending()
							}
						},
						deleteOptions: {
							onDeleted: async () => {
								await this.waitingListCallback.reload()
								await this.loadNeededSpending()
							} 
						},
						getEntryView: entry => this.possibleSpendingLineView(entry.item)
					})
				}
			</div>
		</div>
	}
}
