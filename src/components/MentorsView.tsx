import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  User, 
  Mail, 
  Phone, 
  Award, 
  Tag, 
  Users, 
  Shield, 
  Check, 
  Briefcase, 
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { Mentor, Employee } from '../types.ts';

interface MentorsViewProps {
  mentors: Mentor[];
  employees: Employee[];
  userRole: 'admin' | 'manager' | 'mentor';
  onAddMentor: (mentorData: Partial<Mentor>) => Promise<any>;
  onRefresh: () => void;
}

export default function MentorsView({
  mentors,
  employees,
  userRole,
  onAddMentor,
  onRefresh
}: MentorsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterExpertise, setFilterExpertise] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Mentor>>({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    designation: 'Senior Data Engineer',
    yearsOfExperience: 5,
    maxCapacity: 4,
    status: 'Active',
    domainExpertise: '["Python", "SQL"]' // JSON array string
  });
  
  const [selectedExpertise, setSelectedExpertise] = useState<string[]>(['Python', 'SQL']);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Handle open add modal
  const handleOpenAdd = () => {
    setFormData({
      employeeId: `MNT${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      email: '',
      phone: '',
      designation: 'Senior Data Engineer',
      yearsOfExperience: 5,
      maxCapacity: 4,
      status: 'Active',
      domainExpertise: '["Python", "SQL"]'
    });
    setSelectedExpertise(['Python', 'SQL']);
    setFormError('');
    setFormSuccess('');
    setIsModalOpen(true);
  };

  const handleExpertiseToggle = (skill: string) => {
    if (selectedExpertise.includes(skill)) {
      setSelectedExpertise(selectedExpertise.filter(s => s !== skill));
    } else {
      setSelectedExpertise([...selectedExpertise, skill]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formData.employeeId || !formData.name || !formData.email) {
      setFormError('Please fill out all mandatory fields (Mentor ID, Name, Email).');
      return;
    }

    if (selectedExpertise.length === 0) {
      setFormError('Please select at least one Domain Expertise.');
      return;
    }

    try {
      const payload = {
        ...formData,
        domainExpertise: JSON.stringify(selectedExpertise)
      };
      
      await onAddMentor(payload);
      setFormSuccess('Mentor registered successfully!');
      setTimeout(() => {
        setIsModalOpen(false);
        onRefresh();
      }, 1000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to register the mentor.');
    }
  };

  // Helper to parse domain expertise string safely
  const parseExpertise = (expertiseStr: string): string[] => {
    try {
      const parsed = JSON.parse(expertiseStr);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // split by comma if not valid JSON array
    }
    if (typeof expertiseStr === 'string' && expertiseStr) {
      return expertiseStr.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  // Filtered list
  const filteredMentors = mentors.filter(m => {
    const skills = parseExpertise(m.domainExpertise);
    
    const matchesSearch = 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.designation && m.designation.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesExpertise = filterExpertise === 'All' || skills.some(s => s.toLowerCase() === filterExpertise.toLowerCase());
    const matchesStatus = filterStatus === 'All' || m.status === filterStatus;

    return matchesSearch && matchesExpertise && matchesStatus;
  });

  const availableSkillsList = ['Python', 'SQL', 'Spark', 'PySpark', 'Airflow', 'Kafka', 'Databricks', 'AWS', 'GCP', 'Data Modelling'];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Mentors Directory</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Manage corporate trainers, review assigned mentees, capacity constraints, and average assessment scores.</p>
        </div>

        {/* Restricting to Excel synchronization only, manual addition removed */}
      </div>

      {/* Directory Filters */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <input
            id="mentor-search-input"
            type="text"
            placeholder="Search mentors by ID, name, email or designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl pl-9 pr-4 py-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full md:w-auto">
          <select
            id="filter-expertise-select"
            value={filterExpertise}
            onChange={(e) => setFilterExpertise(e.target.value)}
            className="text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Expertise</option>
            <option value="Python">Python</option>
            <option value="SQL">SQL</option>
            <option value="Spark">Spark</option>
            <option value="PySpark">PySpark</option>
            <option value="Airflow">Airflow</option>
            <option value="Kafka">Kafka</option>
          </select>

          <select
            id="filter-mentor-status-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredMentors.map((mentor) => {
          const mentorMentees = employees.filter(emp => emp.assignedMentor === mentor.name);
          const expertiseList = parseExpertise(mentor.domainExpertise);
          
          return (
            <div 
              key={mentor.id} 
              id={`mentor-card-${mentor.id}`}
              className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800/80 p-6 flex flex-col justify-between hover:shadow-md transition-all space-y-5"
            >
              {/* Mentor General Info */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-150 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 font-extrabold text-base uppercase shrink-0">
                      {mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-sm leading-snug">{mentor.name}</h3>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 dark:text-zinc-500">{mentor.employeeId}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    mentor.status === 'Active' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40' 
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}>
                    {mentor.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs text-zinc-550">
                  {mentor.designation && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="truncate font-semibold">{mentor.designation}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="truncate">{mentor.email}</span>
                  </div>
                  {mentor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span>{mentor.phone}</span>
                    </div>
                  )}
                  {mentor.yearsOfExperience !== null && (
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span><strong>{mentor.yearsOfExperience}</strong> Years Experience</span>
                    </div>
                  )}
                </div>

                {/* Domain Expertise Tags */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Domain Expertise</span>
                  <div className="flex flex-wrap gap-1">
                    {expertiseList.map((skill, index) => (
                      <span 
                        key={index} 
                        className="px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-150 dark:border-zinc-700 text-zinc-650 dark:text-zinc-350 text-[10px] font-bold rounded-md"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Mentees Listing Area */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-zinc-500 font-bold">
                    <Users className="w-4 h-4 text-zinc-400" />
                    <span>Mentees Enrolled:</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    mentorMentees.length >= mentor.maxCapacity 
                      ? 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200' 
                      : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400'
                  }`}>
                    {mentorMentees.length} / {mentor.maxCapacity} Max Capacity
                  </span>
                </div>

                {/* Sub-list of Mentees */}
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                  {mentorMentees.map((emp) => {
                    const rating = emp.overallScore || 0;
                    return (
                      <div 
                        key={emp.id}
                        className="flex items-center justify-between p-2 bg-zinc-50/50 dark:bg-zinc-850/45 rounded-xl border border-zinc-100 dark:border-zinc-800"
                      >
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 block truncate">{emp.name}</span>
                          <span className="text-[9px] font-medium text-zinc-400 block">{emp.employeeId} • {emp.skillGroup}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-zinc-400 block">Overall Score</span>
                          <span className={`text-[10px] font-black ${
                            rating >= 4.0 ? 'text-emerald-600' :
                            rating >= 2.5 ? 'text-indigo-600' : 'text-amber-600'
                          }`}>
                            {rating ? `${rating.toFixed(2)}/5` : 'N/A'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {mentorMentees.length === 0 && (
                    <div className="text-center py-4 text-zinc-400 text-[11px] italic">
                      No active bench mentees assigned.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredMentors.length === 0 && (
          <div className="col-span-full text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-2">
            <UserCheck className="w-8 h-8 text-zinc-400 mx-auto" />
            <h3 className="font-bold text-zinc-700 dark:text-zinc-300">No Mentors Match Your Selection</h3>
            <p className="text-xs text-zinc-400">Try adjusting your filter search query or clear existing selections.</p>
          </div>
        )}
      </div>

      {/* Add Mentor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Register Corporate Mentor</h2>
                <p className="text-xs text-zinc-500">Provide personal info, expertise matrices, and limit thresholds.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Section 1: Core credentials */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Mentor Employee ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    placeholder="e.g. MNT101"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Sneha Rao"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Work Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. sneharao@company.com"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. +91 9876543210"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Section 2: Experience thresholds */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-50 dark:border-zinc-800 pt-4">
                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Corporate Designation</label>
                  <input
                    type="text"
                    value={formData.designation || ''}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Lead Consultant"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Years of Exp</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.yearsOfExperience || ''}
                    onChange={(e) => setFormData({ ...formData, yearsOfExperience: Number(e.target.value) })}
                    placeholder="e.g. 8"
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block mb-1">Max Mentee Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData({ ...formData, maxCapacity: Number(e.target.value) })}
                    className="w-full text-xs bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-2.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Section 3: Domain Expertise Selection */}
              <div className="border-t border-zinc-50 dark:border-zinc-800 pt-4 space-y-2">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 block">Domain Expertise Matrix *</label>
                <div className="flex flex-wrap gap-2">
                  {availableSkillsList.map((skill) => {
                    const isSelected = selectedExpertise.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => handleExpertiseToggle(skill)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-350'
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-6 border-t border-zinc-50 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Register Mentor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
