import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
export function OutlineButtons() {
    return (
        <Card>
            <CardHeader className="border-b py-4">
                <CardTitle className="text-xl">Outline Buttons</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6 p-6">

                {/* Outline Buttons */}
                <div>
                    <p className="mb-3 text-lg font-medium text-muted-foreground">
                        Default
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">

                        {/* Primary */}
                        <Button
                            variant="outline"
                            className="px-6 dark:bg-transparent dark:border-border dark:text-foreground"
                        >
                            Primary
                        </Button>

                        {/* Error */}
                        <Button
                            variant="outline"
                            className="text-red-600 border-red-500 hover:bg-red-50 hover:text-red-600
               dark:bg-transparent dark:border-red-500 dark:text-red-400 px-6"
                        >
                            Error
                        </Button>

                        {/* Success */}
                        <Button
                            variant="outline"
                            className="text-green-600 border-green-500 hover:bg-green-50 hover:text-green-600
               dark:bg-transparent dark:border-green-500 dark:text-green-400 px-6"
                        >
                            Success
                        </Button>

                        {/* Info */}
                        <Button
                            variant="outline"
                            className="text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-600
               dark:bg-transparent dark:border-blue-500 dark:text-blue-400 px-6"
                        >
                            Info
                        </Button>

                        {/* Warning */}
                        <Button
                            variant="outline"
                            className="text-orange-600 border-orange-500 hover:bg-orange-50 hover:text-orange-600
               dark:bg-transparent dark:border-orange-500 dark:text-orange-400 px-6"
                        >
                            Warning
                        </Button>

                        {/* Purple */}
                        <Button
                            variant="outline"
                            className="text-purple-600 border-purple-500 hover:bg-purple-50 hover:text-purple-600
               dark:bg-transparent dark:border-purple-500 dark:text-purple-400 px-6"
                        >
                            Purple
                        </Button>

                        {/* Amber */}
                        <Button
                            variant="outline"
                            className="text-amber-600 border-amber-500 hover:bg-amber-50 hover:text-amber-600
               dark:bg-transparent dark:border-amber-500 dark:text-amber-400 px-6"
                        >
                            Amber
                        </Button>

                        {/* Pink */}
                        <Button
                            variant="outline"
                            className="text-pink-600 border-pink-500 hover:bg-pink-50 hover:text-pink-600
               dark:bg-transparent dark:border-pink-500 dark:text-pink-400 px-6"
                        >
                            Pink
                        </Button>

                        {/* Yellow */}
                        <Button
                            variant="outline"
                            className="text-yellow-600 border-yellow-500 hover:bg-yellow-50 hover:text-yellow-600
               dark:bg-transparent dark:border-yellow-500 dark:text-yellow-400 px-6"
                        >
                            Yellow
                        </Button>

                        {/* Secondary */}
                        <Button
                            variant="outline"
                            className="text-gray-600 border-gray-400 hover:bg-gray-50 hover:text-gray-600
               dark:bg-transparent dark:border-gray-400 dark:text-gray-400 px-6"
                        >
                            Secondary
                        </Button>

                    </div>

                </div>

                {/* Rounded Buttons */}
                <div>
                    <p className="mb-3 text-lg font-medium text-muted-foreground">
                        Rounded
                    </p>

                    <div className="flex items-center gap-3 flex-wrap">

                        {/* Primary */}
                        <Button
                            variant="outline"
                            className="px-6 rounded-full dark:bg-transparent dark:border-border dark:text-foreground"
                        >
                            Primary
                        </Button>

                        {/* Error */}
                        <Button
                            variant="outline"
                            className="text-red-600 border-red-500 hover:bg-red-50 hover:text-red-600
               dark:bg-transparent dark:border-red-500 dark:text-red-400
               px-6 rounded-full"
                        >
                            Error
                        </Button>

                        {/* Success */}
                        <Button
                            variant="outline"
                            className="text-green-600 border-green-500 hover:bg-green-50 hover:text-green-600
               dark:bg-transparent dark:border-green-500 dark:text-green-400
               px-6 rounded-full"
                        >
                            Success
                        </Button>

                        {/* Info */}
                        <Button
                            variant="outline"
                            className="text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-600
               dark:bg-transparent dark:border-blue-500 dark:text-blue-400
               px-6 rounded-full"
                        >
                            Info
                        </Button>

                        {/* Warning */}
                        <Button
                            variant="outline"
                            className="text-orange-600 border-orange-500 hover:bg-orange-50 hover:text-orange-600
               dark:bg-transparent dark:border-orange-500 dark:text-orange-400
               px-6 rounded-full"
                        >
                            Warning
                        </Button>

                        {/* Purple */}
                        <Button
                            variant="outline"
                            className="text-purple-600 border-purple-500 hover:bg-purple-50 hover:text-purple-600
               dark:bg-transparent dark:border-purple-500 dark:text-purple-400
               px-6 rounded-full"
                        >
                            Purple
                        </Button>

                        {/* Amber */}
                        <Button
                            variant="outline"
                            className="text-amber-600 border-amber-500 hover:bg-amber-50 hover:text-amber-600
               dark:bg-transparent dark:border-amber-500 dark:text-amber-400
               px-6 rounded-full"
                        >
                            Amber
                        </Button>

                        {/* Pink */}
                        <Button
                            variant="outline"
                            className="text-pink-600 border-pink-500 hover:bg-pink-50 hover:text-pink-600
               dark:bg-transparent dark:border-pink-500 dark:text-pink-400
               px-6 rounded-full"
                        >
                            Pink
                        </Button>

                        {/* Yellow */}
                        <Button
                            variant="outline"
                            className="text-yellow-600 border-yellow-500 hover:bg-yellow-50 hover:text-yellow-600
               dark:bg-transparent dark:border-yellow-500 dark:text-yellow-400
               px-6 rounded-full"
                        >
                            Yellow
                        </Button>

                        {/* Secondary */}
                        <Button
                            variant="outline"
                            className="text-gray-600 border-gray-400 hover:bg-gray-50 hover:text-gray-600
               dark:bg-transparent dark:border-gray-400 dark:text-gray-400
               px-6 rounded-full"
                        >
                            Secondary
                        </Button>

                    </div>

                </div>

            </CardContent>
        </Card>
    )
}