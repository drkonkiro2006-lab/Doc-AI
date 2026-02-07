
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UI_CLASSES } from '../constants';
import { getHealthPrediction } from '../services/geminiService';
import { UserProfile, HealthPrediction } from '../types';

// Custom Bar Chart Component
const BarChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const maxValue = Math.max(...data.map(d => d.value), 100);
  
  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-700">{item.label}</span>
            <span className="font-bold text-neutral-900">{item.value}%</span>
          </div>
          <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: item.color
              }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Risk Level Indicator Component
const RiskLevelChart: React.FC<{ categories: { category: string; items: any[] }[] }> = ({ categories }) => {
  const riskData = useMemo(() => {
    return categories.map(cat => {
      const highPriorityCount = cat.items?.filter(item => item.isHighPriority).length || 0;
      const totalCount = cat.items?.length || 1;
      const riskPercentage = Math.round((highPriorityCount / totalCount) * 100);
      
      return {
        label: cat.category,
        value: riskPercentage,
        color: riskPercentage > 60 ? '#ef4444' : riskPercentage > 30 ? '#f97316' : '#6B705C'
      };
    });
  }, [categories]);

  return <BarChart data={riskData} />;
};

// Extract measures from description text
const extractMeasures = (description: string): string[] => {
  // Try to extract bullet points or numbered items
  const bulletPattern = /[•\-\*]\s*([^\n•\-\*]+)/g;
  const numberedPattern = /\d+[\.\)]\s*([^\n\d]+)/g;
  const lineBreakPattern = /([^\n]+)/g;
  
  let measures: string[] = [];
  
  // Check for bullet points first
  const bulletMatches = description.match(bulletPattern);
  if (bulletMatches && bulletMatches.length > 1) {
    measures = bulletMatches.map(m => m.replace(/^[•\-\*]\s*/, '').trim()).filter(m => m.length > 10);
  } else {
    // Check for numbered items
    const numberedMatches = description.match(numberedPattern);
    if (numberedMatches && numberedMatches.length > 1) {
      measures = numberedMatches.map(m => m.replace(/^\d+[\.\)]\s*/, '').trim()).filter(m => m.length > 10);
    } else {
      // Split by sentences and take actionable ones
      const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15);
      measures = sentences.slice(0, 5); // Limit to 5 measures
    }
  }
  
  return measures.length > 0 ? measures : [description]; // Fallback to full description
};

const Prediction: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<HealthPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoize user key to prevent unnecessary re-fetches
  const userKey = useMemo(() => {
    return `${user.email}-${user.age}-${user.gender}-${user.goal}`;
  }, [user.email, user.age, user.gender, user.goal]);

  // Check localStorage for cached prediction
  const getCachedPrediction = useCallback(() => {
    try {
      const cached = localStorage.getItem(`prediction-${userKey}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Cache valid for 1 hour
        if (Date.now() - timestamp < 3600000) {
          return data;
        }
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }
    return null;
  }, [userKey]);

  // Save prediction to cache
  const cachePrediction = useCallback((data: HealthPrediction) => {
    try {
      localStorage.setItem(`prediction-${userKey}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }, [userKey]);

  useEffect(() => {
    // Check cache first
    const cached = getCachedPrediction();
    if (cached) {
      setPrediction(cached);
      setLoading(false);
      return;
    }

    // Only proceed if we have minimum required data
    if (!user.email || (!user.age && !user.gender)) {
      setError('Insufficient user data for prediction');
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setError('Request timed out. Please try again.');
        setLoading(false);
      }
    }, 30000); // 30 second timeout

    const generate = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getHealthPrediction(user);
        if (!cancelled) {
          setPrediction(res);
          cachePrediction(res);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Prediction error:', err);
          
          // Extract user-friendly error message
          let errorMessage = 'Failed to generate prediction. Please try again.';
          
          if (err?.message) {
            errorMessage = err.message;
          } else if (typeof err === 'string') {
            try {
              const parsed = JSON.parse(err);
              errorMessage = parsed.error?.message || parsed.message || errorMessage;
            } catch {
              errorMessage = err;
            }
          } else if (err?.error?.message) {
            errorMessage = err.error.message;
          }
          
          setError(errorMessage);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }
    };

    generate();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [userKey, user, getCachedPrediction, cachePrediction]);

  // Calculate overall risk score with intelligent analysis
  const overallRiskScore = useMemo(() => {
    if (!prediction?.riskCategories) return 0;
    
    let riskScore = 0;
    let maxPossibleScore = 0;
    
    // Risk keywords that indicate severity
    const highRiskKeywords = [
      'life-threatening', 'critical', 'severe', 'urgent', 'emergency', 'dangerous',
      'serious', 'acute', 'chronic', 'cancer', 'tumor', 'malignant', 'stroke',
      'heart attack', 'diabetes', 'hypertension', 'kidney failure', 'liver disease'
    ];
    
    const mediumRiskKeywords = [
      'moderate', 'elevated', 'increased risk', 'warning', 'caution', 'monitor',
      'preventive', 'early stage', 'developing'
    ];
    
    // Factor 1: Risk Categories (weight: 30%)
    const categoryCount = prediction.riskCategories.length;
    const categoryScore = Math.min(categoryCount * 10, 30); // Max 30 points
    riskScore += categoryScore;
    maxPossibleScore += 30;
    
    // Factor 2: High Priority Items (weight: 40%)
    let highPriorityCount = 0;
    let totalItems = 0;
    let keywordRiskScore = 0;
    
    prediction.riskCategories.forEach(cat => {
      cat.items?.forEach(item => {
        totalItems++;
        if (item.isHighPriority) {
          highPriorityCount++;
        }
        
        // Analyze description for risk keywords
        const description = (item.heading + ' ' + item.description).toLowerCase();
        const hasHighRisk = highRiskKeywords.some(keyword => description.includes(keyword));
        const hasMediumRisk = mediumRiskKeywords.some(keyword => description.includes(keyword));
        
        if (hasHighRisk) {
          keywordRiskScore += 3;
        } else if (hasMediumRisk) {
          keywordRiskScore += 1;
        }
      });
    });
    
    const priorityScore = totalItems > 0 
      ? Math.min((highPriorityCount / totalItems) * 40, 40)
      : 0;
    riskScore += priorityScore;
    maxPossibleScore += 40;
    
    // Factor 3: Keyword Analysis (weight: 20%)
    const keywordScore = Math.min(keywordRiskScore * 2, 20);
    riskScore += keywordScore;
    maxPossibleScore += 20;
    
    // Factor 4: Monitoring Signs Urgency (weight: 10%)
    if (prediction.monitoringSigns && prediction.monitoringSigns.length > 0) {
      let urgencyScore = 0;
      prediction.monitoringSigns.forEach(sign => {
        if (sign.urgency === 'High') urgencyScore += 3;
        else if (sign.urgency === 'Medium') urgencyScore += 2;
        else urgencyScore += 1;
      });
      
      const avgUrgency = urgencyScore / prediction.monitoringSigns.length;
      const urgencyPercentage = Math.min((avgUrgency / 3) * 10, 10);
      riskScore += urgencyPercentage;
    }
    maxPossibleScore += 10;
    
    // Calculate final percentage with minimum threshold
    const calculatedScore = maxPossibleScore > 0 
      ? Math.round((riskScore / maxPossibleScore) * 100)
      : 0;
    
    // Apply minimum threshold: if there are any risk categories, show at least 15%
    // If there are high priority items or high urgency signs, show at least 25%
    let finalScore = calculatedScore;
    
    if (categoryCount > 0 && calculatedScore < 15) {
      finalScore = 15;
    }
    
    if ((highPriorityCount > 0 || 
         (prediction.monitoringSigns?.some(s => s.urgency === 'High'))) && 
        calculatedScore < 25) {
      finalScore = Math.max(25, calculatedScore);
    }
    
    // Cap at 95% to leave room for improvement
    return Math.min(finalScore, 95);
  }, [prediction]);

  // Calculate risk level for each category with better logic
  const getCategoryRiskScore = useCallback((category: { category: string; items: any[] }) => {
    const highPriorityCount = category.items?.filter(item => item.isHighPriority).length || 0;
    const totalCount = category.items?.length || 0;
    
    if (totalCount === 0) return 0;
    
    // Base calculation
    let baseScore = Math.round((highPriorityCount / totalCount) * 100);
    
    // If no high priority flags but items exist, analyze content
    if (baseScore === 0 && totalCount > 0) {
      const highRiskKeywords = ['life-threatening', 'critical', 'severe', 'urgent', 'serious', 'chronic'];
      let keywordMatches = 0;
      
      category.items.forEach(item => {
        const text = (item.heading + ' ' + item.description).toLowerCase();
        if (highRiskKeywords.some(keyword => text.includes(keyword))) {
          keywordMatches++;
        }
      });
      
      // If keywords found, assign risk score
      if (keywordMatches > 0) {
        baseScore = Math.round((keywordMatches / totalCount) * 60) + 20; // At least 20% if keywords found
      } else {
        // Default to moderate risk if items exist but no flags/keywords
        baseScore = 30;
      }
    }
    
    return Math.min(baseScore, 95);
  }, []);

  return (
    <div className="space-y-10">
      <header>
        <p className={UI_CLASSES.subheading}>Predictive Care</p>
        <h2 className={UI_CLASSES.heading}>360° Health Forecast</h2>
        <p className="text-neutral-500 max-w-lg">Advanced longitudinal analysis to predict future health trajectories and preventive pathways.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className={`${UI_CLASSES.card} !p-6 animate-reveal`}>
          <p className={UI_CLASSES.subheading}>Chronological Age</p>
          <p className="text-3xl font-bold text-neutral-900">{user.age || 'N/A'}</p>
        </div>
        <div className={`${UI_CLASSES.card} !p-6 animate-reveal [animation-delay:100ms]`}>
          <p className={UI_CLASSES.subheading}>Patient Profile</p>
          <p className="text-3xl font-bold text-neutral-900">{user.gender || 'N/A'}</p>
        </div>
        <div className={`${UI_CLASSES.card} !p-6 animate-reveal [animation-delay:200ms]`}>
          <p className={UI_CLASSES.subheading}>Primary Objective</p>
          <p className="text-xl font-bold text-neutral-900 truncate">{user.goal || 'N/A'}</p>
        </div>
      </div>

      <div className={`${UI_CLASSES.card} min-h-[500px] relative overflow-hidden group animate-reveal [animation-delay:300ms]`}>
        <div className="absolute top-0 right-0 p-8 opacity-5 text-8xl font-black">✦</div>
        {error ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-2xl text-red-400">⚠</div>
            <p className="text-sm text-red-600 font-medium max-w-xs">{error}</p>
            <button
              onClick={() => {
                setError(null);
                localStorage.removeItem(`prediction-${userKey}`);
                setPrediction(null);
              }}
              className="px-6 py-2 bg-neutral-900 text-white text-sm font-bold rounded-full hover:opacity-90 transition"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-10">
            <div className="flex items-center gap-4">
              <div className="w-4 h-4 bg-neutral-100 rounded-full animate-pulse"></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-300">Generating your health forecast...</p>
            </div>
            <div className="space-y-6">
              <div className="h-4 bg-neutral-50 w-full rounded-full animate-pulse"></div>
              <div className="h-4 bg-neutral-50 w-[95%] rounded-full animate-pulse"></div>
              <div className="h-4 bg-neutral-50 w-[85%] rounded-full animate-pulse"></div>
              <div className="h-4 bg-neutral-50 w-[90%] rounded-full animate-pulse"></div>
              <div className="mt-12 space-y-4">
                 <div className="h-10 bg-neutral-50 w-1/3 rounded-2xl animate-pulse"></div>
                 <div className="h-4 bg-neutral-50 w-full rounded-full animate-pulse"></div>
                 <div className="h-4 bg-neutral-50 w-[92%] rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        ) : prediction ? (
          <div className="relative z-10 animate-reveal space-y-10">
            {/* Overall Risk Score Chart */}
            <div className="bg-gradient-to-br from-neutral-50/80 to-white p-8 rounded-3xl border border-neutral-100">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className={UI_CLASSES.subheading}>Overall Risk Assessment</p>
                  <p className="text-2xl font-bold text-neutral-900 mt-2">{overallRiskScore}%</p>
                  <p className="text-xs text-neutral-500 mt-1">High Priority Areas</p>
                </div>
                <div className="relative w-32 h-32">
                  <svg className="transform -rotate-90 w-32 h-32">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-neutral-100"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - overallRiskScore / 100)}`}
                      className={`transition-all duration-1000 ${
                        overallRiskScore > 60 ? 'text-red-500' : overallRiskScore > 30 ? 'text-orange-500' : 'text-[#6B705C]'
                      }`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${
                      overallRiskScore > 60 ? 'text-red-500' : overallRiskScore > 30 ? 'text-orange-500' : 'text-[#6B705C]'
                    }`}>
                      {overallRiskScore}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Categories Chart */}
            {prediction.riskCategories && prediction.riskCategories.length > 0 && (
              <div className="bg-white p-8 rounded-3xl border border-neutral-100">
                <p className={`${UI_CLASSES.subheading} mb-6`}>Risk Level by Category</p>
                <div className="space-y-3">
                  {prediction.riskCategories.map((cat, idx) => {
                    const riskPercentage = getCategoryRiskScore(cat);
                    const color = riskPercentage > 60 ? '#ef4444' : riskPercentage > 30 ? '#f97316' : '#6B705C';
                    
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-neutral-700">{cat.category}</span>
                          <span className="font-bold text-neutral-900">{riskPercentage}%</span>
                        </div>
                        <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: `${riskPercentage}%`,
                              backgroundColor: color
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clinical Assessment Summary */}
            <div className="bg-neutral-50/50 p-6 rounded-3xl border border-neutral-100">
              <p className={UI_CLASSES.subheading}>Clinical Assessment Summary</p>
              <p className="text-lg font-medium text-neutral-700 leading-relaxed mt-3">{prediction.summary}</p>
            </div>

            {/* Risk Categories with Charts and Measures */}
            <div className="space-y-8">
              {prediction.riskCategories?.map((cat, idx) => {
                const riskPercentage = getCategoryRiskScore(cat);
                
                return (
                  <div key={idx} className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-neutral-900 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#6B705C] rounded-full"></span>
                        {cat.category}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-500">Risk Level:</span>
                        <span className={`text-sm font-bold ${
                          riskPercentage > 60 ? 'text-red-600' : riskPercentage > 30 ? 'text-orange-600' : 'text-[#6B705C]'
                        }`}>
                          {riskPercentage}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Category Risk Bar */}
                    <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${riskPercentage}%`,
                          backgroundColor: riskPercentage > 60 ? '#ef4444' : riskPercentage > 30 ? '#f97316' : '#6B705C'
                        }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {cat.items?.map((item, i) => {
                        const measures = extractMeasures(item.description);
                        
                        return (
                          <div 
                            key={i} 
                            className={`p-6 rounded-3xl border transition-all duration-300 ${
                              item.isHighPriority 
                                ? 'bg-orange-50/30 border-orange-100 shadow-sm' 
                                : 'bg-white border-neutral-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4 mb-4">
                              <h4 className={`text-sm font-bold uppercase tracking-widest ${
                                item.isHighPriority ? 'text-orange-700' : 'text-neutral-900'
                              }`}>
                                {item.heading}
                              </h4>
                              {item.isHighPriority && (
                                <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[8px] font-black uppercase tracking-widest rounded-full shrink-0">
                                  Priority
                                </span>
                              )}
                            </div>
                            
                            {/* Measures in Bullet Format */}
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-neutral-700 mb-2 uppercase tracking-wide">
                                Recommended Actions:
                              </p>
                              <ul className="space-y-2">
                                {measures.map((measure, mIdx) => (
                                  <li key={mIdx} className="flex items-start gap-2 text-sm text-neutral-600">
                                    <span className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                                      item.isHighPriority ? 'bg-orange-500' : 'bg-[#6B705C]'
                                    }`}></span>
                                    <span className="leading-relaxed">{measure}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Early Warning Signs with Urgency Chart */}
            <div className="space-y-6 border-t border-neutral-50 pt-10">
              <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-neutral-900 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></span>
                Early Warning Signs to Monitor
              </h3>
              
              {/* Urgency Distribution Chart */}
              {prediction.monitoringSigns && prediction.monitoringSigns.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-neutral-100 mb-6">
                  <p className="text-xs font-bold uppercase tracking-wide text-neutral-700 mb-4">Urgency Distribution</p>
                  <div className="grid grid-cols-3 gap-4">
                    {['High', 'Medium', 'Low'].map(urgency => {
                      const count = prediction.monitoringSigns?.filter(s => s.urgency === urgency).length || 0;
                      const total = prediction.monitoringSigns?.length || 1;
                      const percentage = Math.round((count / total) * 100);
                      
                      return (
                        <div key={urgency} className="text-center">
                          <div className={`text-2xl font-bold mb-1 ${
                            urgency === 'High' ? 'text-red-500' : urgency === 'Medium' ? 'text-yellow-500' : 'text-neutral-400'
                          }`}>
                            {count}
                          </div>
                          <div className="text-xs font-medium text-neutral-600 mb-2">{urgency}</div>
                          <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-1000"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: urgency === 'High' ? '#ef4444' : urgency === 'Medium' ? '#f59e0b' : '#9ca3af'
                              }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {prediction.monitoringSigns?.map((sign, i) => (
                  <div key={i} className="p-5 bg-white border border-neutral-100 rounded-2xl shadow-sm flex gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      sign.urgency === 'High' ? 'bg-red-50 text-red-500' : 
                      sign.urgency === 'Medium' ? 'bg-yellow-50 text-yellow-500' : 
                      'bg-neutral-50 text-neutral-400'
                    }`}>
                      {sign.urgency === 'High' ? '!' : sign.urgency === 'Medium' ? '▲' : '○'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-bold text-neutral-900">{sign.sign}</p>
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${
                          sign.urgency === 'High' ? 'bg-red-100 text-red-600' : 
                          sign.urgency === 'Medium' ? 'bg-yellow-100 text-yellow-600' : 
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          {sign.urgency}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 font-medium leading-relaxed">{sign.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6">
             <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center text-2xl text-neutral-200">◎</div>
             <p className="text-xs text-neutral-400 font-medium max-w-xs">AI insights will appear here as the clinical engine generates your risk profile.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Prediction;
