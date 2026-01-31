import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Calendar,
  Check,
  Trash2,
  AlertCircle,
  Clock,
  Building2,
  MapPin,
  Filter,
} from 'lucide-react';
import {
  useAllTasks,
  useOverdueTasks,
  useUpcomingTasks,
  useTaskCounts,
  useToggleTaskComplete,
  useDeleteTask,
} from '../hooks/useTasks';
import { TASK_PRIORITY_CONFIG, type TaskWithPermit } from '../types';

type TaskFilter = 'all' | 'overdue' | 'today' | 'upcoming';

export default function Tasks() {
  const [filter, setFilter] = useState<TaskFilter>('all');

  const { data: taskCounts } = useTaskCounts();
  const { data: allTasks = [], isLoading: loadingAll } = useAllTasks({ completed: false });
  const { data: overdueTasks = [] } = useOverdueTasks();
  const { data: upcomingTasks = [] } = useUpcomingTasks(7);

  const toggleComplete = useToggleTaskComplete();
  const deleteTask = useDeleteTask();

  // Filter tasks based on selected filter
  const filteredTasks = (() => {
    switch (filter) {
      case 'overdue':
        return overdueTasks;
      case 'today':
        return allTasks.filter((t) => {
          if (!t.due_date) return false;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dueDate = new Date(t.due_date);
          return dueDate >= today && dueDate < tomorrow;
        });
      case 'upcoming':
        return upcomingTasks;
      default:
        return allTasks;
    }
  })();

  const handleToggleComplete = (task: TaskWithPermit) => {
    toggleComplete.mutate({ id: task.id, completed: !task.completed });
  };

  const handleDelete = (taskId: string) => {
    if (confirm('Delete this task?')) {
      deleteTask.mutate(taskId);
    }
  };

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
    if (taskDate < today) {
      const days = Math.floor((today.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24));
      return `${days} day${days > 1 ? 's' : ''} overdue`;
    }

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = (date: string) => {
    return new Date(date) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-clipper-navy">Tasks</h1>
          <p className="mt-1 text-gray-500">
            Manage your follow-up tasks across all permits
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setFilter('all')}
          className={`p-4 rounded-lg border text-left transition-all ${
            filter === 'all'
              ? 'border-clipper-gold bg-clipper-gold/10'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-sm">All Tasks</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{taskCounts?.total || 0}</p>
        </button>

        <button
          onClick={() => setFilter('overdue')}
          className={`p-4 rounded-lg border text-left transition-all ${
            filter === 'overdue'
              ? 'border-red-400 bg-red-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{taskCounts?.overdue || 0}</p>
        </button>

        <button
          onClick={() => setFilter('today')}
          className={`p-4 rounded-lg border text-left transition-all ${
            filter === 'today'
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Due Today</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">{taskCounts?.dueToday || 0}</p>
        </button>

        <button
          onClick={() => setFilter('upcoming')}
          className={`p-4 rounded-lg border text-left transition-all ${
            filter === 'upcoming'
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Upcoming (7 days)</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{taskCounts?.upcoming || 0}</p>
        </button>
      </div>

      {/* Task List */}
      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              Showing {filteredTasks.length}{' '}
              {filter === 'all' ? 'task' : filter === 'overdue' ? 'overdue task' : filter === 'today' ? 'task due today' : 'upcoming task'}
              {filteredTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {loadingAll ? (
          <div className="p-8 text-center text-gray-500">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {filter === 'all' ? 'No tasks yet. Add tasks from permit details.' : `No ${filter} tasks.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 hover:bg-gray-50 transition-colors ${
                  task.due_date && isOverdue(task.due_date) ? 'bg-red-50/50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggleComplete(task)}
                    className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 transition-colors ${
                      task.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-clipper-gold'
                    }`}
                  >
                    {task.completed && <Check className="w-4 h-4" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.title}
                        </p>

                        {/* Permit Info */}
                        <Link
                          to={`/permits/${task.permit_id}`}
                          className="mt-1 flex items-center gap-3 text-sm text-gray-500 hover:text-clipper-navy"
                        >
                          <span className="font-mono">{task.permit_number}</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {task.address}, {task.city}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {task.project_type?.replace('_', ' ')}
                          </span>
                        </Link>
                      </div>

                      {/* Meta Info */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Priority Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            TASK_PRIORITY_CONFIG[task.priority].bgColor
                          } ${TASK_PRIORITY_CONFIG[task.priority].textColor}`}
                        >
                          {TASK_PRIORITY_CONFIG[task.priority].label}
                        </span>

                        {/* Due Date */}
                        {task.due_date && (
                          <span
                            className={`flex items-center gap-1 text-sm ${
                              isOverdue(task.due_date)
                                ? 'text-red-600 font-medium'
                                : 'text-gray-500'
                            }`}
                          >
                            {isOverdue(task.due_date) ? (
                              <AlertCircle className="w-4 h-4" />
                            ) : (
                              <Clock className="w-4 h-4" />
                            )}
                            {formatDueDate(task.due_date)}
                          </span>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
