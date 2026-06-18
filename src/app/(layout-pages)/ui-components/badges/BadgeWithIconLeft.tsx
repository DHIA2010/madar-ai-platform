import { Badge } from "@/components/ui/badge"
import {
    BadgeCheck,
    BookmarkIcon,
    AlertTriangle,
    Info,
    XCircle,
    Star,
    ShieldCheck,
} from "lucide-react"

export function BadgeWithIconLeft() {
    return (
        <div className="flex flex-wrap gap-3">
            <Badge variant="secondary" className="gap-1">
                <BadgeCheck data-icon="inline-start" className="h-4 w-4" />
                <span>Verified</span>
            </Badge>
            <Badge variant="outline" className="gap-1">
                <span>Bookmark</span>
                <BookmarkIcon data-icon="inline-end" className="h-4 w-4" />
            </Badge>
            <Badge variant="secondary" className="gap-1">
                <Info className="h-4 w-4" />
                <span>Info</span>
            </Badge>
            <Badge className="gap-1">
                <Star className="h-4 w-4" />
                <span>Featured</span>
            </Badge>
            <Badge variant="destructive" className="gap-1">
                <XCircle className="h-4 w-4" />
                <span>Blocked</span>
            </Badge>
            <Badge variant="outline" className="gap-1">
                <span>Warning</span>
                <AlertTriangle className="h-4 w-4" />
            </Badge>
            <Badge variant="ghost" className="gap-1">
                <ShieldCheck className="h-4 w-4" />
                <span>Protected</span>
            </Badge>

        </div>
    )
}
