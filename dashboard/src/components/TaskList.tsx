import { useState } from 'react';
import {
  Plus,
  Calendar,
  Clock,
  Check,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  usePermitTasks,
  useCreateTask,
  useToggleTaskComplete,
  useDeleteTask,
} from '../hooks/useTasks';
import { TASK_PRIORITY_CONFIG, type Task, type TaskPriority } from '../types';

interface TaskListProps {
  permitId: string;
  compact?: boolean;
}

export function TaskList({ permitId, compact = false }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: tasks, isLoading } = usePermitTasks(permitId);
  const createTask = useCreateTask();
  const toggleComplete = useToggleTaskComplete();
  const deleteTask = useDeleteTask();

  const incompleteTasks = tasks?.filter((t) => !t.completed) || [];
  const completedTasks = tasks?.filter((t) => t.completed) || [];

  const handleCreateTask = (task: { title: string; due_date?: string; priority: TaskPriority }) => {
    setError(null);
    createTask.mutate(
      {
        permit_id: permitId,
        ...task,
      },
      {
        onSuccess: () => {
          setShowForm(false);
        },
        onError: (err) => {
          console.error('Task creation error:', err);
          setError(err instanceof Error ? err.message : 'Failed to create task');
        },
      }
    );
  };

  const handleToggleComplete = (task: Task) => {
    toggleComplete.mutate({ id: task.id, completed: !task.completed });
  };

  const handleDelete = (taskId: string) => {
    if (confirm('Delete this task?')) {
      deleteTask.mutate(taskId);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading tasks...</div>;
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={`font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
          Tasks {incompleteTasks.length > 0 && `(${incompleteTasks.length})`}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-1 text-clipper-gold hover:text-clipper-gold-dark ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          <Plus className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
          Add Task
        </button>
      </div>

      {/* Task Form */}
      {showForm && (
        <TaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowForm(false)}
          compact={compact}
          isSubmitting={createTask.isPending}
        />
      )}

      {/* Error Message */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Incomplete Tasks */}
      {incompleteTasks.length === 0 && !showForm ? (
        <p className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
          No tasks yet. Add a follow-up reminder.
        </p>
      ) : (
        <div className="space-y-2">
          {incompleteTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggleComplete={() => handleToggleComplete(task)}
              onDelete={() => handleDelete(task.id)}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Completed Tasks Toggle */}
      {completedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className={`flex items-center gap-1 text-gray-500 hover:text-gray-700 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {showCompleted ? (
              <ChevronUp className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            ) : (
              <ChevronDown className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            )}
            {completedTasks.length} completed
          </button>

          {showCompleted && (
            <div className="mt-2 space-y-2 opacity-60">
              {completedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggleComplete={() => handleToggleComplete(task)}
                  onDelete={() => handleDelete(task.id)}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskFormProps {
  onSubmit: (task: { title: string; due_date?: string; priority: TaskPriority }) => void;
  onCancel: () => void;
  compact?: boolean;
  isSubmitting?: boolean;
}

function TaskForm({ onSubmit, onCancel, compact, isSubmitting }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      due_date: dueDate || undefined,
      priority,
    });

    setTitle('');
    setDueDate('');
    setPriority('medium');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-3 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title (e.g., Follow up with applicant)"
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-clipper-gold focus:border-clipper-gold ${
          compact ? 'text-xs' : 'text-sm'
        }`}
        autoFocus
      />

      <div className="flex gap-2 flex-wrap">
        {/* Due Date */}
        <div className="flex items-center gap-1">
          <Calendar className={compact ? 'w-3 h-3 text-gray-400' : 'w-4 h-4 text-gray-400'} />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`px-2 py-1 border border-gray-300 rounded-md ${compact ? 'text-xs' : 'text-sm'}`}
          />
        </div>

        {/* Priority */}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className={`px-2 py-1 border border-gray-300 rounded-md ${compact ? 'text-xs' : 'text-sm'}`}
        >
          <option value="low">Low Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="high">High Priority</option>
        </select>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className={`px-3 py-1.5 text-gray-600 hover:text-gray-800 ${compact ? 'text-xs' : 'text-sm'}`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className={`px-3 py-1.5 bg-clipper-gold text-white rounded-md hover:bg-clipper-gold-dark disabled:opacity-50 disabled:cursor-not-allowed ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {isSubmitting ? 'Adding...' : 'Add Task'}
        </button>
      </div>
    </form>
  );
}

interface TaskItemProps {
  task: Task;
  onToggleComplete: () => void;
  onDelete: () => void;
  compact?: boolean;
}

function TaskItem({ task, onToggleComplete, onDelete, compact }: TaskItemProps) {
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const isOverdue = task.due_date && !task.completed && new Date(task.due_date) < new Date();

  const formatDueDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const taskDate = new Date(d);
    taskDate.setHours(0, 0, 0, 0);

    if (taskDate.getTime() === today.getTime()) return 'Today';
    if (taskDate.getTime() === tomorrow.getTime()) return 'Tomorrow';

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-lg border ${
        task.completed
          ? 'bg-gray-50 border-gray-200'
          : isOverdue
          ? 'bg-red-50 border-red-200'
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={onToggleComplete}
        className={`flex-shrink-0 mt-0.5 rounded border-2 transition-colors ${
          task.completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-clipper-gold'
        } ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
      >
        {task.completed && <Check className={compact ? 'w-3 h-3' : 'w-4 h-4'} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`${task.completed ? 'line-through text-gray-400' : 'text-gray-900'} ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {task.title}
        </p>

        <div className={`flex items-center gap-2 mt-1 flex-wrap ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {/* Priority Badge */}
          <span className={`px-1.5 py-0.5 rounded ${priorityConfig.bgColor} ${priorityConfig.textColor}`}>
            {priorityConfig.label}
          </span>

          {/* Due Date */}
          {task.due_date && (
            <span
              className={`flex items-center gap-1 ${
                isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}
            >
              {isOverdue ? (
                <AlertCircle className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              ) : (
                <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              )}
              {formatDueDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 rounded"
      >
        <Trash2 className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
    </div>
  );
}

export default TaskList;
