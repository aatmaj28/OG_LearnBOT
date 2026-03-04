import { connect, disconnect } from 'mongoose';
import { GradingHistory } from '../models/GradingHistory';

// Function to convert scoringLevels from array format to object format
const convertScoringLevelsFormat = (configRubric: any) => {
  if (!configRubric || !configRubric.criteria) {
    return configRubric;
  }

  const convertedCriteria = configRubric.criteria.map((criterion: any) => {
    let scoringLevels = criterion.scoringLevels;

    // If scoringLevels is an array, convert it to object format
    if (Array.isArray(scoringLevels)) {
      scoringLevels = {
        full: scoringLevels[0] || 'Excellent performance in this criterion.',
        partial: scoringLevels[1] || 'Satisfactory performance in this criterion.',
        minimal: scoringLevels[2] || 'Minimal performance in this criterion.'
      };
    }

    // If scoringLevels is missing or not an object, create default
    if (!scoringLevels || typeof scoringLevels !== 'object') {
      scoringLevels = {
        full: 'Excellent performance in this criterion.',
        partial: 'Satisfactory performance in this criterion.',
        minimal: 'Minimal performance in this criterion.'
      };
    }

    return {
      ...criterion,
      scoringLevels: {
        full: scoringLevels.full || 'Excellent performance in this criterion.',
        partial: scoringLevels.partial || 'Satisfactory performance in this criterion.',
        minimal: scoringLevels.minimal || 'Minimal performance in this criterion.'
      }
    };
  });

  return {
    ...configRubric,
    criteria: convertedCriteria
  };
};

const migrateScoringLevels = async () => {
  try {
    // Connect to MongoDB (update with your connection string)
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/essaybot');
    console.log('Connected to MongoDB');

    // Find all grading history records
    const historyRecords = await GradingHistory.find({});
    console.log(`Found ${historyRecords.length} grading history records`);

    let updatedCount = 0;

    for (const record of historyRecords) {
      let needsUpdate = false;
      
      if (record.config_rubric && record.config_rubric.criteria) {
        for (const criterion of record.config_rubric.criteria) {
          // Check if scoringLevels is in array format
          if (Array.isArray(criterion.scoringLevels)) {
            needsUpdate = true;
            break;
          }
        }
      }

      if (needsUpdate) {
        const convertedConfigRubric = convertScoringLevelsFormat(record.config_rubric);
        
        await GradingHistory.updateOne(
          { _id: record._id },
          { $set: { config_rubric: convertedConfigRubric } }
        );
        
        updatedCount++;
        console.log(`Updated record ${record._id}`);
      }
    }

    console.log(`Migration completed. Updated ${updatedCount} records.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateScoringLevels();
}

export { migrateScoringLevels }; 