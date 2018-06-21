# Discord GW2 Raid Scheduler Bot/Module

(**Possibly outdated**) This code can be used either sa a module for an existing discord bot or as a stand-alone discord bot (by uncommenting marked sections) for scheduling raids for GW2. Bot/module requires mongo connection string and discord api key to be added to work. 

By changing schedules variable a special channel fully moderated by the bot can be created which only contains upcoming raid schedules.

List of commands : 

Start all commands by mentioning the bot. Parameters marked with ? are optional.

- General Commands
  - **raid list** - Shows scheduled raids.
  - **raid info {n?}** - Shows details of selected raid.
  - **raid join {n?} {role?}** - Signs you up for selected raid.
  - **raid leave {n?}** - Leaves the selected raid.
  - **raid role {n?} {role}** - Changes role.
  - **raid pass {n?}** - Moves you to the bottom of backup queue.
  - **raid notifications {on/off/t}** - Notifies you t minutes before raid.
- Leader Commands
  - **raid create {role}, {time}, {name}, {setup?}** - Creates a raid.
  - **raid edit {n} {setting} {value}** - Changes setting to value of selected raid.
  - **raid cancel {n?} {reason?}** - Cancels selected raid.
  - **raid add {name} {n?} {role?}** - Adds a person to selected raid.
  - **raid kick {name} {n?}** - Remove a person from raid.
- Macro Commands
  - **raid macro create {name}** - Creates a macro.
  - **raid macro remove {name}** - Removes selected macro.
  - **raid macro list** - Lists your macros.
  - **raid macro info {name}** - Lists commands of selected macro.
  - **raid macro command add {name} {command}** - Adds new command.
  - **raid macro command edit {name} {n} {command}** - Edits command number n.
  - **raid macro command remove {name} {n}** - Removes command number n.
  - **raid macro {name} {params}** - Executes selected macro.
