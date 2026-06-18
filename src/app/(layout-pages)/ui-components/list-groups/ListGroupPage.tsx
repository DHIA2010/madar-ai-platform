import {BasicListGroups} from "./BasicListGroups"
import {UserFollowList} from "./UserFollowList"
import {PaymentHistory} from "./PaymentHistory"
import {CartList} from "./CartList"
import {StatsQuickNavList} from "./StatsQuickList"
import {TodoList} from "./TodoList"

export default function ListGroupPage () {
    return (
        <div className="list-group-page space-y-6">
           <BasicListGroups/>
           <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
              <UserFollowList/>
              <PaymentHistory/>
              <StatsQuickNavList/>
           </div>

           <div className="grid grid-cols-12 gap-6">
             <div className="col-span-12 2xl:col-span-8">
                <CartList/>
            </div>
            <div className="col-span-12 2xl:col-span-4">
                 <TodoList/>
            </div>
           </div>
            
        </div>
    )
} 