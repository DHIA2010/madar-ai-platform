"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X } from "lucide-react"

export function TodoList() {
  const [tasks, setTasks] = useState([
    { id: 1, text: "This is an example of task #1", completed: true },
    { id: 2, text: "This is an example of task #2", completed: false },
    { id: 3, text: "This is an example of task #3", completed: true },
    { id: 4, text: "This is an example of task #4", completed: false },
    { id: 5, text: "This is an example of task #5", completed: false },
  ])

  const [newTask, setNewTask] = useState("")

  const addTask = () => {
    if (!newTask.trim()) return

    setTasks([
      ...tasks,
      { id: Date.now(), text: newTask.trim(), completed: false },
    ])

    setNewTask("")
  }

  const toggleTask = (id: number) => {
    setTasks(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: !task.completed }
          : task
      )
    )
  }

  const deleteTask = (id: number) => {
    setTasks(tasks.filter((task) => task.id !== id))
  }

  return (
    <Card>
      {/* Optional Header */}
      <CardHeader className="border-b">
        <CardTitle className="text-xl font-medium">Your To Do List</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {/* Add Task */}
        <div className="flex gap-2">
          <Input
            placeholder="Add new task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <Button onClick={addTask}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Task List */}
        <div className="divide-y rounded-lg border">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-3 hover:bg-muted/40 transition"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => toggleTask(task.id)}
                />

                <span
                  className={`text-sm md:text-base ${
                    task.completed
                      ? "line-through text-muted-foreground"
                      : ""
                  }`}
                >
                  {task.text}
                </span>
              </div>

              <Button
                size="icon"
                variant="ghost"
                onClick={() => deleteTask(task.id)}
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  )
}
