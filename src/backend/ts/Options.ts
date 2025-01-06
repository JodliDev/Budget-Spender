import {ServerSettings} from "../../shared/ServerSettings";

export class Options {
	public static serverSettings = new ServerSettings()
	public readonly lang: string = "en"
	public readonly root: string = process.cwd()
	public readonly frontend: string = "dist/frontend"
	public readonly sqlite: string = "dist/config"
	public readonly portHttp: number = 1304
	public readonly pathHttp: string = "/"
	public readonly portWs: number = 13040
	public readonly pathWs: string = "/websocket"
	
	constructor() {
		const keys = Object.keys(this)
		
		//read environment variables:
		
		for(const key of keys) {
			if(process.env[key])
				this[key as keyof this] = process.env[key] as any
		}
		
		//read console arguments:
		
		for(const val of process.argv) {
			for(const key of keys) {
				const match = val.match(`^${key}=(.+)$`)
				if(match) {
					const type = typeof this[key as keyof this]
					switch(type) {
						case "string":
							this[key as keyof this] = match[1] as any
							break
						case "number":
							this[key as keyof this] = parseInt(match[1]) as any
							break
						case "boolean":
							this[key as keyof this] = !!match[1] as any
							break
					}
				}
			}
		}
	}
}
