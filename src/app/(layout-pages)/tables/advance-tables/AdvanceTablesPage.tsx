import ProductTable from "./ProductTable";
import ProjectTable from "./ProjectTable"
import TeamTable from "./TeamTable"

export default function AdvanceTablesPage() {
     return (
        <div className="advance-tables-wrapper space-y-6">
           <ProjectTable/>
           <ProductTable/>
           <TeamTable/>
        </div>
     )
}