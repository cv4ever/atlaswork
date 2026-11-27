// The admin page's Tools section: each permission (src/model.ts, `agentTools`) with its default and the model tools
// only it gives, measured rather than listed (catalogue.ts, `permissionTools`), then every model tool with its spec and
// the prompt line its command adds. A new ability is one `CommandDef` in src/commands/, listed in src/commands.ts; it shows here on the next load.
import { permissionTools } from "./catalogue.ts";

export default function ToolsAdmin() {
  const { permissions, tools } = permissionTools();
  return (
    <section className="admin-page" aria-labelledby="tools-title">
      <header className="admin-head">
        <div><h1 id="tools-title">Tools</h1>
          <p>What each permission switch in an agent&rsquo;s Permissions tab hands the model, measured on Vital in the demo: every switch on, then that one off. Atlas always has all of them.</p></div>
      </header>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Permission</th><th scope="col">Starts</th><th scope="col">What the person reads</th><th scope="col">Model tools only it gives</th></tr></thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission.id}>
                <th scope="row">{permission.label}<small><code>{permission.id}</code></small></th>
                <td>{permission.outside ? "Off, outside" : "off" in permission ? "Off" : "On"}</td>
                <td>{permission.hint}</td>
                <td>{permission.gives.length ? permission.gives.map((name) => <code key={name} className="admin-chip">{name}</code>)
                  : <small>None: it changes what another tool may do, or the prompt only.</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="admin-section-title">Every model tool <small>{tools.length}</small></h2>
      <p className="admin-lede">As Atlas&rsquo;s request offers them in the demo, with a linked folder so the file tools show. The spec is checked by the agent function before a draft becomes a proposal.</p>
      <ul className="admin-specs">
        {tools.map((tool) => (
          <li key={tool.name}>
            <h3><code>{tool.name}</code> <small>{tool.label}</small></h3>
            <p>{tool.description}</p>
            {tool.prompt && <p className="admin-spec-prompt"><span>In the prompt</span>{tool.prompt}</p>}
            <details><summary>Parameters</summary><pre>{JSON.stringify(tool.parameters, null, 2)}</pre></details>
          </li>
        ))}
      </ul>
    </section>
  );
}
